// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      throw new Error("Missing server configuration (URL/Keys)");
    }

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[REQ] Processing evaluation ${evaluationId} (${cardType})`);

    if (!imageBase64) throw new Error("No image data provided");

    // Gemini API Request
    const genResponse = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
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

    if (!genResponse.ok) {
      const errorData = await genResponse.json();
      console.error("[GEMINI ERROR]", errorData);
      throw new Error(`Gemini API error: ${genResponse.status}`);
    }

    const geminiData = await genResponse.json();
    console.log(`[GEMINI RAW]`, JSON.stringify(geminiData));

    const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResult) {
      if (geminiData.promptFeedback?.blockReason) {
        throw new Error(`Gemini bloqueó el contenido: ${geminiData.promptFeedback.blockReason}`);
      }
      throw new Error("Gemini devolvió una respuesta vacía.");
    }

    const jsonMatch = textResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[GEMINI TEXT]", textResult);
      throw new Error("La IA no devolvió un formato JSON válido.");
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    console.log(`[ANALYSIS]`, JSON.stringify(analysis));

    const scores = [analysis.centering.score, analysis.corners.score, analysis.edges.score, analysis.surface.score];
    const finalGrade = Math.min(Math.min(...scores) + 0.5, scores.reduce((a, b) => a + b) / 4).toFixed(1);

    // Update Project Database
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
      console.error("[DB ERROR]", dbError);
      throw dbError;
    }

    return new Response(JSON.stringify({ ...analysis, final_grade: finalGrade }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
