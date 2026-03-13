// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Usamos pro en v1beta que es el más compatible para multimodal en todas las regiones
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";

const PSA_PROMPT = (cardType: string) => `
Eres un experto certificado en grading de cartas coleccionables bajo el sistema PSA.
Analiza esta imagen de una carta de ${cardType} y evalúa con precisión los 4 criterios PSA:
1. CENTRADO (centering)
2. ESQUINAS (corners)
3. BORDES (edges)
4. SUPERFICIE (surface)

Responde SOLO en este formato JSON:
{
  "centering": { "score": 0.0, "front_lr": "50/50", "front_tb": "50/50", "detail": "" },
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
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey) throw new Error("GEMINI_API_KEY no encontrada en secrets.");

    // Log de seguridad solo del prefijo
    console.log(`[CONFIG] Key prefix: ${geminiKey.substring(0, 5)}..., URL: ${supabaseUrl}`);

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[REQ] ID: ${evaluationId}, Tipo: ${cardType}`);

    if (!imageBase64) throw new Error("No hay imagen.");

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
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[GEMINI ERROR]", JSON.stringify(result));
      return new Response(JSON.stringify({ 
        error: "Google API Error", 
        details: result.error || result 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Respuesta vacía de Gemini.");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Respuesta no es JSON.");
    
    const analysis = JSON.parse(jsonMatch[0]);
    const scores = [analysis.centering.score, analysis.corners.score, analysis.edges.score, analysis.surface.score];
    const finalGrade = Math.min(...scores).toFixed(1);

    const supabase = createClient(supabaseUrl!, supabaseKey!);
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
    }).eq("id", evaluationId);

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[FATAL]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
