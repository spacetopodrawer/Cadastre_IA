// scripts/generate-component.ts
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, 'PROMPT_TEMPLATE_SVELTE.md');
const COMPONENTS_DIR = path.join(__dirname, '../templates');
const INDEX_PATH = path.join(COMPONENTS_DIR, 'index.ts');

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function replacePlaceholders(template: string, replacements: Record<string, string>) {
  return template.replace(/{{(.*?)}}/g, (_, key) => replacements[key] || '');
}

async function main() {
  const name = await ask('Nom du composant (ex: CadastreLayer): ');
  const props = await ask('Props (ex: layers: Layer[]): ');
  const store = await ask('Nom du store (ex: layerStore): ');

  const replacements = {
    COMPONENT_NAME: name,
    PROPS: props,
    STORE_NAME: store,
  };

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const content = replacePlaceholders(template, replacements);

  const basePath = path.join(COMPONENTS_DIR, name);
  if (!fs.existsSync(basePath)) fs.mkdirSync(basePath);

  fs.writeFileSync(path.join(basePath, `${name}.svelte`), content);
  fs.writeFileSync(path.join(basePath, `${name}.test.ts`), `// Test unitaire pour ${name}`);
  fs.writeFileSync(path.join(basePath, `${name}.stories.svelte`), `<script>import ${name} from './${name}.svelte';</script>\n<${name} />`);
  fs.writeFileSync(path.join(basePath, `${name}.md`), `# Documentation pour ${name}\n\nProps: ${props}\nStore: ${store}`);

  // Mise à jour de index.ts
  const exportLine = `export { default as ${name} } from './${name}/${name}.svelte';\n`;
  fs.appendFileSync(INDEX_PATH, exportLine);

  console.log(`✅ Composant ${name} généré avec succès dans ${basePath}`);
}

main();
