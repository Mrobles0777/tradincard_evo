import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "npm:@google/generative-ai";

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
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey || !supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Configuración incompleta: faltan variables de entorno." }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
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

    const ai = new GoogleGenAI(geminiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-3-flash",
      generationConfig: { responseMimeType: "application/json" },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });
    
    let analysis;
    try {
      console.log(`[EXEC] Llamando a Gemini 1.5 Flash... (Mime: ${mimeType}, Size: ${base64Data.length})`);
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        { text: PSA_PROMPT(cardType) }
      ]);
      
      const response = result.response;
      let text = "";
      
      try {
        text = response.text() || "";
      } catch (textErr) {
        console.error("[RESPONSE TEXT ERROR]", textErr);
        const feedback = response.promptFeedback;
        throw new Error(`Gemini no devolvió texto. Razón: ${feedback?.blockReason || 'Desconocida'}`);
      }

      // Limpiar bloques de código markdown
      text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La IA no devolvió un formato JSON válido.");
      
      analysis = JSON.parse(jsonMatch[0]);
    } catch (genErr: any) {
      console.error("[GEMINI ERROR]", genErr);
      return new Response(JSON.stringify({ error: `IA Google Rechazó: ${genErr.message}` }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!analysis) {
       return new Response(JSON.stringify({ error: "La IA no pudo procesar la imagen." }), { 
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
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

