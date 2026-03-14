// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Usamos el modelo más reciente 'gemini-2.5-flash' o 'gemini-2.0-flash'
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PSA_PROMPT = (cardType: string) => `
Eres un experto en grading PSA. Analiza detalladamente esta imagen de una carta de ${cardType} y devuelve un análisis en formato JSON estricto.
Debes evaluar los 4 criterios (centering, corners, edges, surface) con una nota de 0 a 10.
Devuelve EXACTAMENTE este formato JSON y nada más:
{
  "centering": { "score": 0, "front_lr": "50/50", "front_tb": "50/50", "detail": "..." },
  "corners": { "score": 0, "detail": "..." },
  "edges": { "score": 0, "detail": "..." },
  "surface": { "score": 0, "detail": "..." },
  "psa_grade": 0,
  "psa_label": "...",
  "qualifier": "NONE",
  "confidence": 0
}
`;

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey) {
      // Retornamos SIEMPRE código 200 para que el cliente de Supabase no bloquee el error
      return new Response(JSON.stringify({ error: "Configuración incompleta: falta GEMINI_API_KEY." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[EXEC] Inciando grading ID: ${evaluationId}`);

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No se recibió ninguna imagen." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Llamada a Gemini Pro Vision
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[GEMINI ERROR]", JSON.stringify(result));
      const errMsg = result.error?.message || "Error desconocido de Gemini API";
      // Devolvemos 200 para que la UI no sufra un crash mudo y muestre el mensaje de error de Google
      return new Response(JSON.stringify({ error: `IA Google Rechazó: ${errMsg}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
       return new Response(JSON.stringify({ error: "La IA no pudo procesar la imagen (respuesta vacía)." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
       return new Response(JSON.stringify({ error: "La IA no devolvió un formato JSON válido." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Error parseando JSON de la IA." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering?.score || 0,
      score_corners: analysis.corners?.score || 0,
      score_edges: analysis.edges?.score || 0,
      score_surface: analysis.surface?.score || 0,
      psa_grade: analysis.psa_grade || 0,
      ai_analysis: analysis,
      confidence_pct: analysis.confidence || 0,
    }).eq("id", evaluationId);

    if (dbError) {
       console.error("[DB ERROR]", dbError);
       return new Response(JSON.stringify({ error: `Error guardando resultados: ${dbError.message}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    // Siempre 200
    return new Response(JSON.stringify({ error: `Error Fatal Función: ${error.message}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
