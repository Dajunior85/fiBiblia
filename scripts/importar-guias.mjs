

import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

// Carrega as variáveis de ambiente do arquivo local.
dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "URL ou chave secreta do Supabase não encontrada no .env.local."
  );
}

// Cliente usado exclusivamente pelo script local de importação.
// Nunca utilize esta chave no frontend Astro.
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
const { data: teste, error: erroTeste } = await supabase
  .from("books")
  .select("id, name")
  .limit(1);

if (erroTeste) {
  console.error("Erro no teste:", erroTeste.message);
  process.exit(1);
}

console.log("Teste concluído. Livros encontrados:", teste.length);
// Pasta com os guias exportados ou mantidos no Obsidian.
const PASTA_GUIAS = path.resolve(
  process.cwd(),
  "fibiblia",
  "Guias Filosóficos"
);


 // Seções reconhecidas e seus tipos no Supabase.
const SECOES = [
  {
    heading: "Comentário filosófico",
    type: "philosophy",
  },
  {
    heading: "Posição filosófica",
    type: "context",
  },
  {
    heading: "Reflexão",
    type: "reflection",
  },
];

// Remove um par externo de colchetes usado no conteúdo Markdown.
function limparTexto(texto) {
  const limpo = texto.trim();

  if (limpo.startsWith("[") && limpo.endsWith("]")) {
    return limpo.slice(1, -1).trim();
  }

  return limpo;
}

// Remove os marcadores de links internos do Obsidian: [[Nome]].
function limparLinkObsidian(valor) {
  return String(valor ?? "")
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .trim();
}

// Extrai somente as seções conhecidas do guia.
function extrairSecoes(conteudo) {
  const secoes = [];
  const linhas = conteudo.split(/\r?\n/);

  let secaoAtual = null;
  let acumulador = [];

  function salvarSecao() {
    if (!secaoAtual) return;

    const texto = limparTexto(acumulador.join("\n"));

    if (texto) {
      secoes.push({
        ...secaoAtual,
        content: texto,
      });
    }
  }

  for (const linha of linhas) {
    const titulo = linha.match(/^##\s+(.+?)\s*$/);

    if (titulo) {
      salvarSecao();

      secaoAtual =
        SECOES.find(
          (secao) =>
            secao.heading.toLowerCase() ===
            titulo[1].trim().toLowerCase()
        ) ?? null;

      acumulador = [];
    } else if (secaoAtual) {
      acumulador.push(linha);
    }
  }

  salvarSecao();

  return secoes;
}

// Localiza um livro bíblico pelo nome.
async function buscarLivro(nomeLivro) {
  const aliases = {
    genesis: ["Gênesis", "Genesis"],
    exodus: ["Êxodo", "Exodus"],
    leviticus: ["Levítico", "Leviticus"],
    numbers: ["Números", "Numbers"],
    deuteronomy: ["Deuteronômio", "Deuteronomy"],
  };

  const chave = nomeLivro
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const candidatos = aliases[chave] ?? [nomeLivro];

  for (const candidato of candidatos) {
    const { data, error } = await supabase
      .from("books")
      .select("id, name")
      .ilike("name", candidato)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

// Localiza um capítulo de um livro.
async function buscarCapitulo(bookId, numeroCapitulo) {
  const { data, error } = await supabase
    .from("chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("chapter_number", numeroCapitulo)
    .maybeSingle();

  if (error) throw error;

  return data;
}

// Cria ou atualiza uma seção editorial.
async function salvarSecao(registro) {
  const { data: existente, error: erroBusca } = await supabase
    .from("editorial_contents")
    .select("id")
    .eq("chapter_id", registro.chapter_id)
    .eq("type", registro.type)
    .eq("title", registro.title)
    .maybeSingle();

  if (erroBusca) throw erroBusca;

  if (existente) {
    const { data, error } = await supabase
      .from("editorial_contents")
      .update({
        ...registro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existente.id)
      .select("id")
      .single();

    if (error) throw error;

    return {
      acao: "Atualizado",
      id: data.id,
    };
  }

  const { data, error } = await supabase
    .from("editorial_contents")
    .insert(registro)
    .select("id")
    .single();

  if (error) throw error;

  return {
    acao: "Importado",
    id: data.id,
  };
}

async function main() {
  // Verifica se a pasta de guias existe.
  await fs.access(PASTA_GUIAS);

  const arquivos = (await fs.readdir(PASTA_GUIAS))
    .filter((nome) => nome.toLowerCase().endsWith(".md"))
    .sort();

  if (arquivos.length === 0) {
    console.log("Nenhum arquivo Markdown encontrado.");
    return;
  }

  console.log(`Guias encontrados: ${arquivos.length}\n`);

  for (const nomeArquivo of arquivos) {
    console.log(`\nProcessando: ${nomeArquivo}`);

    const caminho = path.join(PASTA_GUIAS, nomeArquivo);
    const texto = await fs.readFile(caminho, "utf8");

    // Remove BOM e espaços no início antes de interpretar o YAML.
    const limpo = texto.replace(/^\uFEFF?\s*/, "");
    const { data, content } = matter(limpo);

    const referencias = data.referencias_biblicas ?? [];
    const secoes = extrairSecoes(content);

    const filosofo = limparLinkObsidian(
      data.filosofo ?? "Filósofo não informado"
    );

    console.log(`Filósofo: ${filosofo}`);
    console.log(`Status no arquivo: ${data.status ?? "não informado"}`);
    console.log(`Seções reconhecidas: ${secoes.length}`);

    if (secoes.length === 0) {
      console.log("Nenhuma seção reconhecida. Guia ignorado.");
      continue;
    }

    if (!Array.isArray(referencias) || referencias.length === 0) {
      console.log("Nenhuma referência bíblica encontrada. Guia ignorado.");
      continue;
    }

    for (const referencia of referencias) {
      const nomeLivro = limparLinkObsidian(referencia.livro);
      const numeroCapitulo = Number(referencia.capitulo);
      const versiculos = String(referencia.versiculos ?? "");

      const intervalo = versiculos.match(/^(\d+)\s*-\s*(\d+)$/);

      if (!nomeLivro || !Number.isInteger(numeroCapitulo) ||
          numeroCapitulo < 1 || !intervalo) {
        console.log(
          `Referência inválida: ${nomeLivro} ${numeroCapitulo}, versículos ${versiculos}`
        );
        continue;
      }

      const versiculoInicial = Number(intervalo[1]);
      const versiculoFinal = Number(intervalo[2]);

      if (versiculoInicial < 1 || versiculoFinal < versiculoInicial) {
        console.log(`Intervalo de versículos inválido: ${versiculos}`);
        continue;
      }

      console.log(
        `Referência: ${nomeLivro} ${numeroCapitulo}:${versiculos}`
      );

      const livro = await buscarLivro(nomeLivro);

      if (!livro) {
        console.log(`Livro não encontrado no banco: ${nomeLivro}`);
        continue;
      }

      const capitulo = await buscarCapitulo(
        livro.id,
        numeroCapitulo
      );

      if (!capitulo) {
        console.log(
          `Capítulo não encontrado: ${nomeLivro} ${numeroCapitulo}`
        );
        continue;
      }

      for (const secao of secoes) {
        const titulo =
          `${path.parse(nomeArquivo).name} — ${secao.heading}`;

        // O status definido no Obsidian controla a publicação.
const statusEditorial =
  String(data.status ?? "").trim().toLowerCase() === "publicado"
    ? "published"
    : "draft";

const registro = {
          chapter_id: capitulo.id,
          verse_start: versiculoInicial,
          verse_end: versiculoFinal,
          type: secao.type,
          title: titulo,
          content: secao.content,
          status: statusEditorial,
          author: filosofo,
        };

        const resultado = await salvarSecao(registro);

        console.log(
          `${resultado.acao}: ${titulo} (${statusEditorial})`
        );
      }
    }
  }

  console.log("\nImportação concluída.");
}

main().catch((erro) => {
  console.error(
    "\nErro na importação:",
    erro.message ?? erro
  );

  process.exitCode = 1;
});
