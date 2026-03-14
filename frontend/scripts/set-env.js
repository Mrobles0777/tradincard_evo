const fs = require('fs');
const path = require('path');

// Caminos
const envPath = path.join(__dirname, '../../.env');
const targetPath = path.join(__dirname, '../src/environments/environment.ts');

let envFileContent = '';

// 1. Intentar leer .env (local)
try {
  if (fs.existsSync(envPath)) {
    envFileContent = fs.readFileSync(envPath, 'utf8');
    console.log('Cargando variables desde .env local.');
  } else {
    console.log('.env no encontrado, usando variables de sistema (CI/CD).');
  }
} catch (err) {
  console.warn('Advertencia leyendo .env:', err.message);
}

// 2. Función para obtener variable (.env primero, luego process.env)
const getEnvVar = (name) => {
  // Buscar en el contenido del archivo .env si existe
  const match = envFileContent.match(new RegExp(`${name}=(.*)`, 'i'));
  const valueFromFile = match ? match[1].trim() : null;
  
  // Retornar valor del archivo o del proceso (Vercel/Sistema)
  return valueFromFile || process.env[name] || '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_ANON_KEY');
const isProduction = process.env['VERCEL'] === '1' || process.env['NODE_ENV'] === 'production';

// Validar que tengamos las variables mínimas
if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: No se encontraron SUPABASE_URL o SUPABASE_ANON_KEY.');
  // No salimos con error 1 aquí para permitir que el build intente continuar si es posible, 
  // pero advertimos fuertemente.
}

const envConfigFile = `export const environment = {
  production: ${isProduction},
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}'
};
`;

console.log('Generando archivo de entorno en:', targetPath);

fs.writeFile(targetPath, envConfigFile, function (err) {
  if (err) {
    console.error('Error escribiendo el archivo de entorno:', err);
    process.exit(1);
  }
  console.log('Archivo de entorno generado correctamente.');
});
