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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log("[LOG] --- INICIO DE PETICIÓN ---");
    
    // 1. Verificar variables de entorno
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey || !supabaseUrl || !supabaseKey) {
      console.error("[LOG] Error: Faltan secretos en Supabase (GEMINI_API_KEY, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)");
      throw new Error("Configuración incompleta en el servidor.");
    }

    // 2. Parsear el body manualmente para capturar errores
    const jsonText = await req.text();
    console.log(`[LOG] Tamaño del body recibido: ${Math.round(jsonText.length / 1024)} KB`);
    
    let body;
    try {
      body = JSON.parse(jsonText);
    } catch (e) {
      console.error("[LOG] Error parseando JSON:", e.message);
      throw new Error("El cuerpo de la petición no es un JSON válido.");
    }

    const { imageBase64, cardType, evaluationId } = body;
    if (!imageBase64 || !evaluationId) {
      console.error("[LOG] Error: faltan campos obligatorios");
      throw new Error("Faltan datos requeridos (imagen o ID de evaluación).");
    }

    // 3. Limpiar base64 y detectar tipo
    let mimeType = 'image/jpeg';
    let base64Data = imageBase64;
    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      mimeType = parts[0].split(':')[1] || 'image/jpeg';
      base64Data = parts[1];
    }

    // 4. Llamar a Gemini API (v1beta para mayor compatibilidad con responseMimeType: json)
    console.log(`[LOG] Solicitando análisis a Gemini (gemini-1.5-flash)...`);
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const geminiResponse = await fetch(genUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: PSA_PROMPT(cardType) }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!geminiResponse.ok) {
      const errorJson = await geminiResponse.json();
      console.error("[LOG] Error de Google API:", JSON.stringify(errorJson));
      throw new Error(`Google API respondió: ${errorJson.error?.message || 'Error desconocido'}`);
    }

    const geminiResult = await geminiResponse.json();
    const aiText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      console.error("[LOG] Respuesta de IA vacía o bloqueada:", JSON.stringify(geminiResult));
      throw new Error("La IA no devolvió un análisis. Es posible que el contenido haya sido bloqueado o la imagen sea demasiado borrosa.");
    }

    console.log("[LOG] Análisis recibido exitosamente.");
    
    // 5. Procesar y Guardar en DB
    const analysis = JSON.parse(aiText);
    let confidenceVal = Math.round((analysis.confidence || 0) <= 1 ? (analysis.confidence || 0) * 100 : (analysis.confidence || 0));

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering?.score || 0,
      score_corners: analysis.corners?.score || 0,
      score_edges: analysis.edges?.score || 0,
      score_surface: analysis.surface?.score || 0,
      psa_grade: analysis.psa_grade || 1,
      psa_label: analysis.psa_label || "",
      ai_analysis: analysis,
      confidence_pct: confidenceVal,
    }).eq("id", evaluationId);

    if (dbError) {
      console.error("[LOG] Error al actualizar base de datos:", dbError);
      throw new Error(`Error de base de datos: ${dbError.message}`);
    }

    console.log("[LOG] --- FIN DE PETICIÓN EXITOSA ---");
    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[LOG] CRITICAL ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
