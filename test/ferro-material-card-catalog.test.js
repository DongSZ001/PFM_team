const assert = require('node:assert/strict');
const test = require('node:test');

test('ferro material card catalog groups BFO and PMN-PT into single cards', () => {
  const {
    buildMaterialCards,
    findCatalogVariant,
  } = require('../pf_assistant/src/ferro/material-card-catalog');
  const models = [
    { materialKey: 'bfo', modelKey: 'landau:BFO_Zhang2008_fourth', displayName: 'BFO', modelName: 'BFO Zhang2008 fourth', defaultXf: 1, defaultTem: 298 },
    { materialKey: 'bfo', modelKey: 'landau:BFO_Hsieh2016_sixth', displayName: 'BFO', modelName: 'BFO Hsieh2016 sixth', defaultXf: 1, defaultTem: 298 },
    { materialKey: 'bfo', modelKey: 'landau:BFO_Cao2018_eighth', displayName: 'BFO', modelName: 'BFO Cao2018 eighth', defaultXf: 1, defaultTem: 298 },
    { materialKey: 'bfo', modelKey: 'bfo_10004', displayName: 'BFO', modelName: 'BFO 10004', defaultXf: 1, defaultTem: 298 },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_030_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMNPT 030 Khakpash2015', defaultXf: 0.3, defaultTem: 300 },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_042_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMNPT 042 Khakpash2015', defaultXf: 0.42, defaultTem: 300 },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_070_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMNPT 070 Khakpash2015', defaultXf: 0.7, defaultTem: 300 },
  ];

  const cards = buildMaterialCards(models);
  const bfo = cards.find((card) => card.familyId === 'bfo');
  const pmnpt = cards.find((card) => card.familyId === 'pmn_pt');

  assert.equal(bfo.title, 'BFO');
  assert.equal(bfo.temperature, 298);
  assert.equal(bfo.composition.enabled, false);
  assert.deepEqual(bfo.variants.map((item) => item.variantId), ['bfo_zhang2008_fourth', 'bfo_hsieh2016_sixth', 'bfo_cao2018_eighth']);
  assert.equal(bfo.variants.some((item) => item.materialModelId === 'bfo_10004'), false);

  assert.equal(pmnpt.title, 'PMN-PT');
  assert.equal(pmnpt.composition.label, 'PT组分');
  assert.deepEqual(pmnpt.variants.map((item) => item.compositionValue), [0.3, 0.42, 0.7]);
  assert.equal(JSON.stringify(pmnpt).includes('xf=null'), false);

  assert.equal(findCatalogVariant({ variantId: 'bfo_hsieh2016_sixth' }).variant.referenceLabel, 'Hsieh et al., 2016');
});

test('ferro material card catalog filters cards by family query', () => {
  const { buildMaterialCards } = require('../pf_assistant/src/ferro/material-card-catalog');
  const cards = buildMaterialCards([], { filter: '模拟 BFO 铁电畴' });
  assert.deepEqual(cards.map((card) => card.familyId), ['bfo']);

  const pmnpt = buildMaterialCards([], { filter: 'PMN-PT' });
  assert.deepEqual(pmnpt.map((card) => card.familyId), ['pmn_pt']);
});

test('ferro material card catalog falls back to active database material families', () => {
  const { buildMaterialCards } = require('../pf_assistant/src/ferro/material-card-catalog');
  const models = [
    { materialKey: 'bfo', modelKey: 'landau:BFO_Zhang2008_fourth', displayName: 'BFO', modelName: 'BFO Zhang2008 fourth', defaultXf: 1, defaultTem: 298, active: true },
    { materialKey: 'bfo', modelKey: 'landau:BFO_Hsieh2016_sixth', displayName: 'BFO', modelName: 'BFO Hsieh2016 sixth', defaultXf: 1, defaultTem: 298, active: true },
    { materialKey: 'bfo', modelKey: 'landau:BFO_Cao2018_eighth', displayName: 'BFO', modelName: 'BFO Cao2018 eighth', defaultXf: 1, defaultTem: 298, active: true },
    { materialKey: 'bfo', modelKey: 'bfo_10004', displayName: 'BFO', modelName: 'BFO 10004', defaultXf: 1, defaultTem: 298, active: true },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_030_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMN-PT x=0.30', defaultXf: 0.3, defaultTem: 300, active: true },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_042_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMN-PT x=0.42', defaultXf: 0.42, defaultTem: 300, active: true },
    { materialKey: 'pmn_pt', modelKey: 'landau:PMNPT_070_Khakpash2015', displayName: 'PMN-PT', modelName: 'PMN-PT x=0.70', defaultXf: 0.7, defaultTem: 300, active: true },
    { materialKey: 'pto', modelKey: 'landau:PTO_default', displayName: 'PTO', modelName: 'PTO default', defaultTem: 300, active: true, tags: ['PTO', 'Landau DB'] },
    { materialKey: 'pzt', modelKey: 'pzt_haun_1989', displayName: 'PZT', modelName: 'PZT Haun 1989', defaultXf: 0.48, defaultTem: 300, active: true },
    { materialKey: 'bto', modelKey: 'bto_generate_input', displayName: 'BaTiO3', modelName: 'BTO generate_input', defaultTem: 298, active: true },
    { materialKey: 'knn', modelKey: 'landau:KNN_default', displayName: 'KNN', modelName: 'KNN default', defaultXf: 0.5, defaultTem: 300, active: true },
    { materialKey: 'hzo', modelKey: 'hzo_custom', displayName: 'HZO', modelName: 'HZO custom', defaultTem: 300, active: true },
    { materialKey: 'abc', modelKey: 'abc_inactive', displayName: 'ABC', modelName: 'ABC inactive', defaultTem: 300, active: false },
  ];

  const cards = buildMaterialCards(models);
  const ids = cards.map((card) => card.familyId);
  assert.equal(ids.includes('bfo'), true);
  assert.equal(ids.includes('pmn_pt'), true);
  assert.equal(ids.includes('pto'), true);
  assert.equal(ids.includes('pzt'), true);
  assert.equal(ids.includes('bto'), true);
  assert.equal(ids.includes('knn'), true);
  assert.equal(ids.includes('hzo'), true);
  assert.equal(ids.includes('abc'), false);

  const bfo = cards.find((card) => card.familyId === 'bfo');
  assert.deepEqual(bfo.variants.map((item) => item.variantId), ['bfo_zhang2008_fourth', 'bfo_hsieh2016_sixth', 'bfo_cao2018_eighth']);
  assert.equal(JSON.stringify(bfo).includes('xf=null'), false);

  const pto = cards.find((card) => card.familyId === 'pto');
  assert.equal(pto.cardSource, 'fallback');
  assert.equal(pto.groupMode, 'single');
  assert.equal(pto.variants.length, 1);
  assert.equal(pto.variants[0].materialModelId, 'landau:PTO_default');
  assert.equal(pto.composition.enabled, false);

  const pzt = cards.find((card) => card.familyId === 'pzt');
  assert.equal(pzt.variants.length, 1);
  assert.equal(pzt.composition.enabled, true);
  assert.equal(pzt.composition.value, 0.48);

  const bto = cards.find((card) => card.familyId === 'bto');
  assert.equal(bto.title, 'BaTiO3');
  assert.equal(bto.composition.enabled, false);

  const hzo = cards.find((card) => card.familyId === 'hzo');
  assert.equal(hzo.title, 'HZO');
  assert.equal(hzo.variants[0].buttonLabel, '默认');
});

test('ferro material card catalog filters fallback family cards', () => {
  const { buildMaterialCards } = require('../pf_assistant/src/ferro/material-card-catalog');
  const models = [
    { materialKey: 'pto', modelKey: 'landau:PTO_default', displayName: 'PTO', modelName: 'PTO default', defaultTem: 300, active: true },
    { materialKey: 'pzt', modelKey: 'pzt_haun_1989', displayName: 'PZT', modelName: 'PZT Haun 1989', defaultXf: 0.48, defaultTem: 300, active: true },
  ];

  assert.deepEqual(buildMaterialCards(models, { filter: 'PTO' }).map((card) => card.familyId), ['pto']);
  assert.deepEqual(buildMaterialCards(models, { filter: 'PZT' }).map((card) => card.familyId), ['pzt']);
});
