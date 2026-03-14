import { serve } from "https://deno.land/std@0.160.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PSA_PROMPT = (cardType: string) => `Analiza pacientemente esta imagen de una carta de ${cardType} para grading PSA. 
REGLA CRÍTICA DE NOTA: Si la carta presenta CUALQUIER tipo de arruga, quiebre, doblez o daño estructural (creases/wrinkles), la nota final (psa_grade) NO PUEDE SER MAYOR A 5.0, sin importar qué tan perfecta esté el resto de la carta.

Devuelve estrictamente este JSON en ESPAÑOL (todos los campos "detail", "psa_label" y "summary"). 
IMPORTANTE: El valor de "psa_grade" debe ser un número entre 1.0 y 10.0 (nunca 0).
{
  "centering": {"score": 0, "front_lr": "50/50", "front_tb": "50/50", "detail": "Detalle del centrado en español..."},
  "corners": {"score": 0, "detail": "Detalle de las esquinas en español..."},
  "edges": {"score": 0, "detail": "Detalle de los bordes en español..."},
  "surface": {"score": 0, "detail": "Detalle de la superficie y daños en español..."},
  "psa_grade": 1,
  "psa_label": "Etiqueta PSA en español (ej: Gema Menta, Cerca de Menta, etc)",
  "qualifier": "NONE",
  "confidence": 0,
  "summary": "Resumen general de la evaluación en español..."
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey) throw new Error("Falta GEMINI_API_KEY.");
    if (!supabaseUrl || !supabaseKey) throw new Error("Faltan logs de Supabase.");

    const body = await req.json().catch(() => ({}));
    const { imageBase64, cardType, evaluationId } = body;

    if (!imageBase64 || !evaluationId) throw new Error("Faltan datos de entrada.");

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    
    // Usamos v1beta y el modelo gemini-1.5-flash para máxima compatibilidad estable durante el debug
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const geminiRes = await fetch(genUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            { text: PSA_PROMPT(cardType || 'pokemon') }
          ]
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
      })
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      throw new Error(`Google AI: ${err.error?.message || 'Error desconocido'}`);
    }

    const { candidates } = await geminiRes.json();
    const aiText = candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) throw new Error("Sin respuesta de IA.");

    const analysis = JSON.parse(aiText);
    const scoreVal = (val: any) => parseFloat(val) || 0;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: scoreVal(analysis.centering?.score),
      score_corners: scoreVal(analysis.corners?.score),
      score_edges: scoreVal(analysis.edges?.score),
      score_surface: scoreVal(analysis.surface?.score),
      psa_grade: scoreVal(analysis.psa_grade) || 1,
      psa_label: analysis.psa_label || "",
      ai_analysis: analysis,
      confidence_pct: Math.round((analysis.confidence || 0) * 100) || 50,
    }).eq("id", evaluationId);

    if (dbError) throw new Error(`DB Error: ${dbError.message}`);

    return new Response(JSON.stringify({ success: true, analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[ERROR]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
