const fs = require('fs');
const path = require('path');

// Camino al archivo .env en la raíz del proyecto
const envPath = path.join(__dirname, '../../.env');
const targetPath = path.join(__dirname, '../src/environments/environment.ts');

let envFileContent = '';

try {
  envFileContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
  console.error('Error leyendo el archivo .env:', err.message);
  process.exit(1);
}

// Extraer variables usando regex
const getEnvVar = (name) => {
  const match = envFileContent.match(new RegExp(`${name}=(.*)`, 'i'));
  return match ? match[1].trim() : '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_ANON_KEY');

const envConfigFile = `export const environment = {
  production: false,
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
