import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildWorkbookBytes } from "../src/modules/DashboardRenderer/browserExcel";
test("XLSX preserves decimal strings and user text cannot become spreadsheet formulas",()=>{
  const zip=unzipSync(buildWorkbookBytes({Invoices:[{Customer:'=HYPERLINK("https://example.invalid")',"Amount AED":"9999999999999.99"}]}));
  const sheet=strFromU8(zip["xl/worksheets/sheet1.xml"]);
  assert.match(sheet,/9999999999999\.99/);assert.match(sheet,/t="inlineStr"/);assert.doesNotMatch(sheet,/<f>/);
});
