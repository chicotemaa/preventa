import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCheekValidity,
  extractCheekMagazineUrl,
  parseCheekTsvPage,
} from "./cheek.js";

test("detecta la revista PDF oficial en la configuracion de DearFlip", () => {
  const html = `
    <script>
      window.option_df_241 = {
        "source":"https:\/\/cheeksa.com.ar\/wp-content\/uploads\/2024\/05\/julio-3-baja.pdf"
      };
    </script>
  `;

  assert.equal(
    extractCheekMagazineUrl(html, "https://cheeksa.com.ar/"),
    "https://cheeksa.com.ar/wp-content/uploads/2024/05/julio-3-baja.pdf",
  );
});

test("extrae la vigencia publicada en la portada", () => {
  assert.equal(
    extractCheekValidity(
      "Ofertas validas desde el 13/07/26 hasta el 18/07/26 y/o hasta agotar stock",
    ),
    "13/07/26 al 18/07/26",
  );
});

test("asocia cada precio con el producto ubicado encima y descarta financiacion", () => {
  const tsv = buildTsv([
    line(1, 1, 70, 100, "GALLETITAS CHOCOLINAS X 170 GRS ORIGINAL"),
    line(2, 1, 150, 145, "$ 1.385"),
    line(3, 2, 470, 100, "MERMELADA LA CAMPAGNOLA BC FRASCO X 390 GRS"),
    line(4, 2, 560, 145, "$ 1.990"),
    line(5, 3, 75, 300, "NARANJA X PLAN Z 3 CUOTAS"),
    line(6, 3, 170, 340, "$ 10"),
  ]);

  assert.deepEqual(parseCheekTsvPage(tsv, 3), [
    {
      name: "GALLETITAS CHOCOLINAS X 170 GRS ORIGINAL",
      price: 1385,
      page: 3,
    },
    {
      name: "MERMELADA LA CAMPAGNOLA BC FRASCO X 390 GRS",
      price: 1990,
      page: 3,
    },
  ]);
});

test("recupera un precio grande aunque el OCR pierda el simbolo de moneda", () => {
  const namesTsv = buildTsv([
    line(1, 1, 65, 100, "ALFAJORES MOOD BLANCO X 65 GRS"),
  ]);
  const priceTsv = buildTsv([
    lineWithHeight(2, 2, 65, 150, 62, "ha 1.390"),
    lineWithHeight(3, 3, 65, 260, 20, "PRESENTACION X 1.000 GRS"),
  ]);

  assert.deepEqual(parseCheekTsvPage(namesTsv, 3, priceTsv), [
    {
      name: "ALFAJORES MOOD BLANCO X 65 GRS",
      price: 1390,
      page: 3,
    },
  ]);
});

type TestLine = {
  id: number;
  block: number;
  left: number;
  top: number;
  height: number;
  text: string;
};

function line(
  id: number,
  block: number,
  left: number,
  top: number,
  text: string,
): TestLine {
  return lineWithHeight(id, block, left, top, 18, text);
}

function lineWithHeight(
  id: number,
  block: number,
  left: number,
  top: number,
  height: number,
  text: string,
): TestLine {
  return { id, block, left, top, height, text };
}

function buildTsv(lines: TestLine[]) {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const rows = lines.flatMap((entry) => {
    let cursor = entry.left;
    return entry.text.split(" ").map((word, index) => {
      const width = Math.max(word.length * 8, 12);
      const row = [
        5,
        1,
        entry.block,
        1,
        entry.id,
        index + 1,
        cursor,
        entry.top,
        width,
        entry.height,
        95,
        word,
      ].join("\t");
      cursor += width + 6;
      return row;
    });
  });

  return [header, ...rows].join("\n");
}
