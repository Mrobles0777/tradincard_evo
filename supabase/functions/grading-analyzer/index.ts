// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Usando el endpoint V1 estable con el modelo flash
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

const PSA_PROMPT = (cardType: string) => `
Eres un experto certificado en grading de cartas coleccionables bajo el sistema PSA.
Analiza esta imagen de una carta de ${cardType} y evalúa con precisión los 4 criterios PSA:

1. CENTRADO (centering): Mide la proporción de bordes izquierdo/derecho y top/bottom.
   - PSA 10: ≤55/45 frontal, ≤75/25 trasera
   - PSA 9: ≤60/40 frontal
   - PSA 8: ≤65/35 frontal
   
2. ESQUINAS (corners): Evalúa filo, redondeo, y desgaste.
   - 10: Perfectamente afiladas bajo lupa
   - 7-9: Micro desgaste apenas visible
   - 1-6: Redondeo notable o fraying

3. BORDES (edges): Astillas, cortes, rugosidad.
   - 10: Integridad perfecta, sin chips
   - 5-9: Mínimas imperfecciones
   - 1-4: Chips visibles o cortes

4. SUPERFICIE (surface): Rayaduras, manchas, brillo original.
   - 10: Lustre original intacto, sin rayaduras
   - 7-9: Micro rayaduras bajo luz directa
   - 1-6: Rayaduras, staining o pérdida de brillo

Responde SOLO en este JSON sin texto adicional:
{
  "centering": { "score": 0.0, "front_lr": "55/45", "front_tb": "52/48", "detail": "" },
  "corners": { "score": 0.0, "detail": "" },
  "edges": { "score": 0.0, "detail": "" },
  "surface": { "score": 0.0, "detail": "" },
  "psa_grade": 0.0,
  "psa_label": "",
  "qualifier": "NONE",
  "confidence": 0,
  "summary": ""
}
`;

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    console.log(`[DIAGNOSTIC] Key set: ${!!geminiKey}, URL: ${supabaseUrl}`);

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      throw new Error("Missing configuration: GEMINI_API_KEY or SUPABASE_URL. Check secrets.");
    }

    const body = await req.json();
    const { imageBase64, cardType, evaluationId } = body;
    
    console.log(`[REQ] ID: ${evaluationId}, Type: ${cardType}, ImageLength: ${imageBase64?.length}`);

    if (!imageBase64) throw new Error("Base64 image is missing.");

    // Call Gemini
    const response = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PSA_PROMPT(cardType) },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("[GEMINI ERROR BODY]", JSON.stringify(result));
      throw new Error(`Gemini API Error (${response.status}): ${result.error?.message || 'Unknown'}`);
    }

    console.log("[GEMINI RESPONSE OK]");
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error("[GEMINI FULL RESPONSE]", JSON.stringify(result));
      throw new Error("Gemini produced no text result. Check content safety or image quality.");
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[RAW TEXT]", text);
      throw new Error("AI did not return valid JSON.");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    const scores = [analysis.centering.score, analysis.corners.score, analysis.edges.score, analysis.surface.score];
    const finalGrade = Math.min(Math.min(...scores) + 0.5, scores.reduce((a, b) => a + b) / 4).toFixed(1);

    // Save to DB
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering.score,
      score_corners: analysis.corners.score,
      score_edges: analysis.edges.score,
      score_surface: analysis.surface.score,
      centering_front_lr: analysis.centering.front_lr,
      centering_front_tb: analysis.centering.front_tb,
      psa_grade: parseFloat(finalGrade),
      psa_label: analysis.psa_label,
      psa_qualifier: analysis.qualifier,
      ai_analysis: analysis,
      confidence_pct: analysis.confidence,
      updated_at: new Date().toISOString()
    }).eq("id", evaluationId);

    if (dbError) {
      console.error("[DB UPDATE ERROR]", dbError);
      throw dbError;
    }

    console.log(`[SUCCESS] Evaluation ${evaluationId} updated with grade ${finalGrade}`);

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL ERROR] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
