-- ==========================================
-- TABLA: profiles (extiende auth.users)
-- ==========================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ENUM: tipos de carta y calificadores PSA
-- ==========================================
CREATE TYPE card_type AS ENUM ('pokemon', 'yugioh', 'football');
CREATE TYPE psa_qualifier AS ENUM ('OC', 'ST', 'PD', 'OF', 'MK', 'NONE');

-- ==========================================
-- TABLA: cards (catálogo de cartas)
-- ==========================================
CREATE TABLE public.cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_type    card_type NOT NULL,
  name         TEXT NOT NULL,
  set_name     TEXT,
  card_number  TEXT,
  year         INT,
  is_holo      BOOLEAN DEFAULT FALSE,
  is_first_ed  BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- TABLA: evaluations (evaluaciones PSA)
-- ==========================================
CREATE TABLE public.evaluations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id             UUID REFERENCES public.cards(id),
  
  -- Imágenes almacenadas en Storage
  front_image_path    TEXT NOT NULL,
  back_image_path     TEXT,
  
  -- Tipo y nombre libre si la carta no está en catálogo
  card_type           card_type NOT NULL,
  card_name_free      TEXT,
  
  -- === SCORES PSA (0.0 - 10.0 por criterio) ===
  score_centering     NUMERIC(4,2) CHECK (score_centering BETWEEN 0 AND 10),
  score_corners       NUMERIC(4,2) CHECK (score_corners BETWEEN 0 AND 10),
  score_edges         NUMERIC(4,2) CHECK (score_edges BETWEEN 0 AND 10),
  score_surface       NUMERIC(4,2) CHECK (score_surface BETWEEN 0 AND 10),
  
  -- === CENTERING DETAIL ===
  centering_front_lr  TEXT,  -- e.g. "55/45"
  centering_front_tb  TEXT,  -- e.g. "52/48"
  centering_back_lr   TEXT,
  centering_back_tb   TEXT,
  
  -- === RESULTADO FINAL ===
  psa_grade           NUMERIC(3,1) CHECK (psa_grade BETWEEN 1 AND 10),
  psa_label           TEXT,        -- "Gem Mint", "Mint", "NM-MT"...
  psa_qualifier       psa_qualifier DEFAULT 'NONE',
  
  -- Análisis completo de Gemini (JSON)
  ai_analysis         JSONB,
  
  -- Confianza del modelo (0-100)
  confidence_pct      INT CHECK (confidence_pct BETWEEN 0 AND 100),
  
  -- Notas del usuario
  user_notes          TEXT,
  
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- TABLA: collections (colección del usuario)
-- ==========================================
CREATE TABLE public.collections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT 'Mi Colección',
  description    TEXT,
  is_public      BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- TABLA: collection_items (cartas en colección)
-- ==========================================
CREATE TABLE public.collection_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id   UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  evaluation_id   UUID REFERENCES public.evaluations(id),
  added_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de rendimiento
CREATE INDEX idx_evaluations_user    ON public.evaluations(user_id);
CREATE INDEX idx_evaluations_type    ON public.evaluations(card_type);
CREATE INDEX idx_evaluations_grade   ON public.evaluations(psa_grade);
CREATE INDEX idx_evaluations_created ON public.evaluations(created_at DESC);
CREATE INDEX idx_collection_items    ON public.collection_items(collection_id);

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Activar RLS en todas las tablas
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- profiles: solo el dueño puede ver/editar
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- evaluations: usuario ve solo las suyas
CREATE POLICY "evaluations_owner" ON public.evaluations
  FOR ALL USING (auth.uid() = user_id);

-- collections: públicas visibles para todos, privadas solo para dueño
CREATE POLICY "collections_public_read" ON public.collections
  FOR SELECT USING (is_public = TRUE OR auth.uid() = user_id);

CREATE POLICY "collections_owner_write" ON public.collections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "collection_items_owner" ON public.collection_items
  FOR ALL USING (
    collection_id IN (
      SELECT id FROM public.collections WHERE user_id = auth.uid()
    )
  );

-- Bucket privado para imágenes de cartas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-images',
  'card-images',
  FALSE,
  10485760,  -- 10MB máximo
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
);

-- Política: solo el dueño sube/lee sus imágenes
CREATE POLICY "card_images_owner" ON storage.objects
  FOR ALL USING (
    bucket_id = 'card-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
