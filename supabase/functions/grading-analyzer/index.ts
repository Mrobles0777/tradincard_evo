import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey || !supabaseUrl || !supabaseKey) {
      throw new Error("Variables de entorno incompletas.");
    }

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[EXEC] Iniciando grading ID: ${evaluationId}`);

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No se recibió ninguna imagen." }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Detectar MimeType y Base64 real
    let mimeType = 'image/jpeg';
    let base64Data = imageBase64;
    
    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      mimeType = parts[0].split(':')[1];
      base64Data = parts[1];
    }

    console.log(`[EXEC] Llamando a Gemini API... (Mime: ${mimeType}, Size: ${base64Data.length})`);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: PSA_PROMPT(cardType) }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error("[GEMINI API ERROR]", errData);
      throw new Error(`Google API respondió: ${errData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error("La IA no devolvió contenido.");
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      console.error("[PARSE ERROR]", text);
      throw new Error("La IA no devolvió un formato JSON válido.");
    }
    
    let confidenceVal = analysis.confidence || 0;
    if (confidenceVal <= 1 && confidenceVal > 0) {
      confidenceVal = confidenceVal * 100; // Convert 0.95 to 95
    }
    confidenceVal = Math.round(confidenceVal);

    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering?.score || 0,
      score_corners: analysis.corners?.score || 0,
      score_edges: analysis.edges?.score || 0,
      score_surface: analysis.surface?.score || 0,
      psa_grade: analysis.psa_grade || 0,
      psa_label: analysis.psa_label || "",
      ai_analysis: analysis,
      confidence_pct: confidenceVal,
    }).eq("id", evaluationId);

    if (dbError) {
       console.error("[DB ERROR]", dbError);
       return new Response(JSON.stringify({ error: `Error guardando resultados: ${dbError.message}` }), { 
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    return new Response(JSON.stringify({ error: `Error Fatal Función: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

