/**
 * FOMA Sentence Parser (Beta) — Visual English Sentence Syntax Analyzer
 * Author & Developer: Nikita Kolyada (https://foma-creative.com)
 * Company / Organization: foma-creative.com
 *
 * 100% Client-Side Privacy:
 * - No external server tracking or telemetry.
 * - Autonomous in-browser grammar parsing.
 */
(function() {
  if (typeof window === 'undefined') return;
  window.chrome = window.chrome || {};
  if (!window.chrome.storage || !window.chrome.storage.local) {
    window.chrome.storage = window.chrome.storage || {};
    window.chrome.storage.local = {
      get: function(keys, callback) {
        var res = {};
        var list = [];
        if (!keys) {
          for (var i = 0; i < localStorage.length; i++) list.push(localStorage.key(i));
        } else if (Array.isArray(keys)) {
          list = keys;
        } else if (typeof keys === 'string') {
          list = [keys];
        } else if (typeof keys === 'object') {
          list = Object.keys(keys);
          res = Object.assign({}, keys);
        }
        list.forEach(function(k) {
          try {
            var raw = localStorage.getItem(k);
            if (raw !== null) res[k] = JSON.parse(raw);
          } catch (_) {
            res[k] = localStorage.getItem(k);
          }
        });
        if (typeof callback === 'function') setTimeout(function() { callback(res); }, 0);
        return Promise.resolve(res);
      },
      set: function(items, callback) {
        if (items && typeof items === 'object') {
          Object.keys(items).forEach(function(k) {
            try { localStorage.setItem(k, JSON.stringify(items[k])); } catch (_) {}
          });
        }
        if (typeof callback === 'function') setTimeout(function() { callback(); }, 0);
        return Promise.resolve();
      },
      remove: function(keys, callback) {
        var list = Array.isArray(keys) ? keys : [keys];
        list.forEach(function(k) { try { localStorage.removeItem(k); } catch (_) {} });
        if (typeof callback === 'function') setTimeout(function() { callback(); }, 0);
        return Promise.resolve();
      },
      clear: function(callback) {
        try { localStorage.clear(); } catch (_) {}
        if (typeof callback === 'function') setTimeout(function() { callback(); }, 0);
        return Promise.resolve();
      }
    };
  }
})();

/**
 * FOMA Sentence Parser — Core Application Logic
 * Ported from Google Docs Apps Script add-on to Chrome Extension / Web Standard.
 */

'use strict';

const $ = id => document.getElementById(id);

/* ---------- Data Structures & Grammar Taxonomy ---------- */
const MEMBER_GROUPS = [
  ['Core', [['Subject', 'solid', '1'], ['Predicate', 'double', '2'], ['Predicative', 'ddash', '']]],
  ['Objects', [['Indirect object', 'dotted', '3'], ['Direct object', 'dashed', '4'], ['Prepositional object', 'dashed', '']]],
  ['Attributes', [['Attribute', 'wavy', '0'], ['Apposition', 'wavy', '']]],
  ['Adverbial modifiers', [
    ['AdvM manner', 'dashdot', '5'], ['AdvM place', 'dashdot', '6'], ['AdvM time', 'dashdot', '7'],
    ['AdvM frequency', 'dashdot', '8'], ['AdvM degree', 'dashdot', '9'], ['AdvM cause', 'dashdot', ''],
    ['AdvM purpose', 'dashdot', ''], ['AdvM condition', 'dashdot', ''], ['AdvM concession', 'dashdot', '']
  ]],
  ['Other', [['Introductory element', 'dotted', ''], ['Address', 'dotted', '']]]
];
const MG = MEMBER_GROUPS;

const MEMBER_STYLES = {}, HOTKEY_MEMBER_MAP = {};
MEMBER_GROUPS.forEach(([g, a]) => a.forEach(([n, s, k]) => { MEMBER_STYLES[n] = s; if (k) HOTKEY_MEMBER_MAP[k] = n; }));
const MS = MEMBER_STYLES, KEY = HOTKEY_MEMBER_MAP;

const CLAUSE_GROUPS = [
  ['Clauses', [
    'Main clause', 'Coordinate clause', 'Subject clause', 'Predicative clause',
    'Object clause', 'Attributive clause (defining)', 'Attributive clause (non-defining)'
  ]],
  ['Adverbial clauses', [
    'AdvCl time', 'AdvCl place', 'AdvCl cause', 'AdvCl purpose',
    'AdvCl condition', 'AdvCl concession', 'AdvCl manner', 'AdvCl result', 'AdvCl comparison'
  ]],
  ['Phrases & constructions', [
    'Prepositional phrase', 'Infinitive phrase', 'Gerund phrase', 'Participial phrase',
    'Absolute construction', 'Complex object', 'Complex subject', 'Noun phrase', 'Verb phrase'
  ]]
];
const CG = CLAUSE_GROUPS;

const TENSE_FORM_GROUPS = [
  ['Present', 'Past', 'Future'],
  ['Simple', 'Continuous', 'Perfect', 'Perfect Continuous'],
  ['Active', 'Passive'],
  ['Indicative', 'Imperative', 'Subjunctive', 'Conditional']
];
const TFG = TENSE_FORM_GROUPS;

const SENTENCE_STRUCTURE_GROUPS = [
  ['Structure', ['Simple', 'Compound', 'Complex', 'Compound-complex']],
  ['Purpose', ['Declarative', 'Interrogative', 'Imperative', 'Exclamatory']],
  ['Question type', ['General', 'Special', 'Alternative', 'Disjunctive']],
  ['Polarity', ['Affirmative', 'Negative']]
];
const SG = SENTENCE_STRUCTURE_GROUPS;

const POS_KEYS = ['n', 'pron', 'adj', 'num', 'v', 'adv', 'art', 'prep', 'conj', 'part', 'int', 'det'];
const PK = POS_KEYS;

const POS_OPTIONS = {
  n: ['Noun', 'n.', [['common', 'proper'], ['countable', 'uncountable'], ['concrete', 'abstract', 'collective', 'material'], ['singular', 'plural'], ['common case', 'possessive case']]],
  pron: ['Pronoun', 'pron.', [['personal', 'possessive', 'reflexive', 'demonstrative', 'interrogative', 'relative', 'indefinite', 'negative', 'reciprocal', 'defining'], ['nominative', 'objective'], ['conjoint', 'absolute']]],
  adj: ['Adjective', 'adj.', [['qualitative', 'relative'], ['positive', 'comparative', 'superlative']]],
  num: ['Numeral', 'num.', [['cardinal', 'ordinal']]],
  v: ['Verb', 'v.', [['notional', 'auxiliary', 'modal', 'link'], ['finite', 'infinitive', 'gerund', 'participle I', 'participle II'], ['regular', 'irregular'], ['transitive', 'intransitive']]],
  adv: ['Adverb', 'adv.', [['manner', 'place', 'time', 'frequency', 'degree', 'interrogative', 'relative'], ['positive', 'comparative', 'superlative']]],
  art: ['Article', 'art.', [['definite', 'indefinite']]],
  prep: ['Preposition', 'prep.', [['simple', 'compound', 'phrasal'], ['place', 'time', 'direction', 'cause', 'other']]],
  conj: ['Conjunction', 'conj.', [['coordinating', 'subordinating', 'correlative']]],
  part: ['Particle', 'part.', [['negative', 'infinitive to', 'emphatic']]],
  int: ['Interjection', 'int.', []],
  det: ['Determiner', 'det.', [['quantifier', 'demonstrative', 'possessive', 'distributive']]]
};
const PO = POS_OPTIONS;

const CL = [
  ['art', ['indefinite'], 'a an'],
  ['art', ['definite'], 'the'],
  ['prep', [], 'in on at by with for from of about into over under between through during without within against among across behind near'],
  ['conj', ['coordinating'], 'and but or'],
  ['conj', ['subordinating'], 'because although while when if than unless until whereas'],
  ['pron', ['personal'], 'i you he she it we they me him her us them'],
  ['pron', ['possessive'], 'my your his its our their mine yours theirs'],
  ['pron', ['reflexive'], 'myself yourself himself herself itself themselves ourselves'],
  ['pron', ['demonstrative'], 'this these those'],
  ['pron', ['defining'], 'all each every both other another'],
  ['v', ['modal'], 'can could may might must shall should will would']
];

const AUTO = {};
CL.forEach(([p, s, w]) => w.split(' ').forEach(x => AUTO[x] = [p, s]));

// ── 100% Invariant Auto-Tagging Configuration ──────────────────────────────
const DEFAULT_AUTO_100_RULES = {
  articles: true,
  pronouns_cases: true,
  numerals: true,
  calendar_proper: true,
  particles_conj: true,
  pure_prepositions: true,
  modals: true,
  sentence_purpose: true,
  sentence_polarity: true,
  passive_voice: true,
  subject_pronouns: true,
  address_vocative: true
};

let auto100Rules = { ...DEFAULT_AUTO_100_RULES };

const M_ABBR = {
  'Subject': ['Subject', 'Subj', 'Subj.', 'S'],
  'Predicate': ['Predicate', 'Pred', 'Pred.', 'P'],
  'Predicative': ['Predicative', 'Predic', 'Pred.', 'Pr'],
  'Direct object': ['Direct object', 'DirObj', 'Dir.obj', 'Obj', 'DO'],
  'Indirect object': ['Indirect object', 'IndObj', 'Ind.obj', 'IO'],
  'Prepositional object': ['Prepositional object', 'PrepObj', 'Prep.obj', 'PO'],
  'Attribute': ['Attribute', 'Attr', 'Attr.', 'At'],
  'Apposition': ['Apposition', 'Appos', 'Appos.', 'Ap'],
  'AdvM manner': ['AdvM manner', 'AdvM man', 'Adv.man', 'AdvM', 'Manner', 'Adv.m', 'AM'],
  'AdvM place': ['AdvM place', 'AdvM pl', 'Adv.place', 'AdvM', 'Place', 'Adv.p', 'AP'],
  'AdvM time': ['AdvM time', 'AdvM tm', 'Adv.time', 'AdvM', 'Time', 'Adv.t', 'AT'],
  'AdvM frequency': ['AdvM frequency', 'AdvM freq', 'Adv.freq', 'AdvM', 'Freq', 'Adv.f', 'AF'],
  'AdvM degree': ['AdvM degree', 'AdvM deg', 'Adv.deg', 'AdvM', 'Deg', 'Adv.d', 'AD'],
  'AdvM cause': ['AdvM cause', 'AdvM caus', 'Adv.caus', 'AdvM', 'Cause', 'Adv.c', 'AC'],
  'AdvM purpose': ['AdvM purpose', 'AdvM purp', 'Adv.purp', 'AdvM', 'Purp', 'Adv.pr', 'AP'],
  'AdvM condition': ['AdvM condition', 'AdvM cond', 'Adv.cond', 'AdvM', 'Cond', 'Adv.cn', 'AC'],
  'AdvM concession': ['AdvM concession', 'AdvM conc', 'Adv.conc', 'AdvM', 'Conc', 'Adv.cc', 'AC'],
  'Introductory element': ['Introductory element', 'Introductory', 'Introd.', 'Intro', 'Intr', 'IE'],
  'Address': ['Address', 'Addr.', 'Addr', 'Ad']
};

const C_ABBR = {
  'Main clause': ['Main clause', 'Main cl', 'Main'],
  'Coordinate clause': ['Coord clause', 'Coord cl', 'Coord'],
  'Subject clause': ['Subj clause', 'Subj cl', 'S.cl'],
  'Predicative clause': ['Pred clause', 'Pred cl', 'Pr.cl'],
  'Object clause': ['Object clause', 'Obj cl', 'Obj.cl'],
  'Attributive clause (defining)': ['Attr cl (def)', 'Attr(def)', 'Attr.d'],
  'Attributive clause (non-defining)': ['Attr cl (non-def)', 'Attr(non-def)', 'Attr.nd'],
  'AdvCl time': ['AdvCl time', 'AdvCl tm', 'ACl.t'],
  'AdvCl place': ['AdvCl place', 'AdvCl pl', 'ACl.p'],
  'AdvCl cause': ['AdvCl cause', 'AdvCl caus', 'ACl.c'],
  'AdvCl purpose': ['AdvCl purpose', 'AdvCl purp', 'ACl.pr'],
  'AdvCl condition': ['AdvCl cond', 'AdvCl cond', 'ACl.cn'],
  'AdvCl concession': ['AdvCl conc', 'AdvCl conc', 'ACl.cc'],
  'AdvCl manner': ['AdvCl manner', 'AdvCl man', 'ACl.m'],
  'AdvCl result': ['AdvCl result', 'AdvCl res', 'ACl.r'],
  'AdvCl comparison': ['AdvCl comp', 'AdvCl comp', 'ACl.cp'],
  'Prepositional phrase': ['Prep phrase', 'Prep.phr', 'PrepPh'],
  'Infinitive phrase': ['Inf phrase', 'Inf.phr', 'InfPh'],
  'Gerund phrase': ['Ger phrase', 'Ger.phr', 'GerPh'],
  'Participial phrase': ['Part phrase', 'Part.phr', 'PartPh'],
  'Absolute construction': ['Abs constr', 'Abs.const', 'AbsC'],
  'Complex object': ['Complex obj', 'Comp.obj', 'CO'],
  'Complex subject': ['Complex subj', 'Comp.subj', 'CS'],
  'Noun phrase': ['Noun phrase', 'Noun.phr', 'NP'],
  'Verb phrase': ['Verb phrase', 'Verb.phr', 'VP']
};

function getFAbbr(val) {
  if (!val) return [];
  const list = [];
  let s = val
    .replace(/\bPresent\b/gi, 'Pres.')
    .replace(/\bPast\b/gi, 'Past')
    .replace(/\bFuture\b/gi, 'Fut.')
    .replace(/\bContinuous\b/gi, 'Cont.')
    .replace(/\bIndicative\b/gi, 'Ind.')
    .replace(/\bSubjunctive\b/gi, 'Subj.')
    .replace(/\bConditional\b/gi, 'Cond.')
    .replace(/\bPassive\b/gi, 'Pass.')
    .replace(/\bActive\b/gi, 'Act.')
    .replace(/\bSimple\b/gi, 'Simp.')
    .replace(/\bPerfect\b/gi, 'Perf.');
  list.push(s);

  let s2 = s.replace(/\s*Ind\./gi, '').trim();
  if (s2 !== s) list.push(s2);

  let s3 = s2.replace(/\s*Act\./gi, '').trim();
  if (s3 !== s2) list.push(s3);

  let initials = val.split(/\s+/).map(w => w[0]?.toUpperCase()).filter(Boolean).join('.') + '.';
  list.push(initials);
  return list;
}

function getSmartLabel(ctx, val, kind, maxW) {
  if (!val) return '';
  const abbrList = (kind === 'm' ? M_ABBR[val] : (kind === 'c' ? C_ABBR[val] : (kind === 'f' ? getFAbbr(val) : null))) || [];
  let candidates;
  if (kind === 'm') {
    if (typeof partsFormat !== 'undefined' && partsFormat === 'full') {
      candidates = [val, ...abbrList];
    } else if (typeof partsFormat !== 'undefined' && (partsFormat === 'short' || partsFormat === 'combo')) {
      candidates = abbrList.length > 1 ? abbrList.slice(1) : [val, ...abbrList];
    } else {
      candidates = [val, ...abbrList];
    }
  } else {
    candidates = [val, ...abbrList];
  }
  const unique = [...new Set(candidates)];
  for (const cand of unique) {
    if (ctx.measureText(cand).width <= maxW) {
      return cand;
    }
  }
  return unique[unique.length - 1];
}

const SUB_ABBR = {
  'personal': 'pers.',
  'possessive': 'poss.',
  'reflexive': 'refl.',
  'demonstrative': 'dem.',
  'interrogative': 'interrog.',
  'relative': 'rel.',
  'indefinite': 'indef.',
  'negative': 'neg.',
  'reciprocal': 'recip.',
  'defining': 'def.',
  'nominative': 'nom.',
  'objective': 'obj.',
  'conjoint': 'conj.',
  'absolute': 'abs.',
  'qualitative': 'qual.',
  'positive': 'pos.',
  'comparative': 'comp.',
  'superlative': 'sup.',
  'cardinal': 'card.',
  'ordinal': 'ord.',
  'notional': 'not.',
  'auxiliary': 'aux.',
  'modal': 'mod.',
  'link': 'link',
  'finite': 'fin.',
  'infinitive': 'inf.',
  'gerund': 'ger.',
  'participle I': 'part.I',
  'participle II': 'part.II',
  'regular': 'reg.',
  'irregular': 'irreg.',
  'transitive': 'trans.',
  'intransitive': 'intrans.',
  'common': 'comm.',
  'proper': 'prop.',
  'countable': 'count.',
  'uncountable': 'uncount.',
  'concrete': 'concr.',
  'abstract': 'abstr.',
  'collective': 'coll.',
  'material': 'mat.',
  'singular': 'sg.',
  'plural': 'pl.',
  'common case': 'comm.',
  'possessive case': 'poss.',
  'definite': 'def.',
  'simple': 'simp.',
  'compound': 'comp.',
  'phrasal': 'phr.',
  'coordinating': 'coord.',
  'subordinating': 'subord.',
  'correlative': 'correl.',
  'infinitive to': 'to',
  'emphatic': 'emph.',
  'quantifier': 'quant.',
  'distributive': 'distr.',
  'manner': 'mann.',
  'place': 'place',
  'time': 'time',
  'frequency': 'freq.',
  'degree': 'deg.',
  'direction': 'dir.',
  'cause': 'cause',
  'other': 'oth.'
};

/** Smart abbreviation & line wrapping of token subtypes (subs) to fit available space without losing selected items. */
function getSmartSubLines(ctx, k, maxW = Infinity) {
  if (!k || !k.s || !k.s.length) return [];
  ctx.save();
  ctx.font = FS_;

  // 1. If only 1 item: prefer full name if it fits, else abbreviation
  if (k.s.length === 1) {
    const full = k.s[0];
    if (ctx.measureText(full).width <= maxW) {
      ctx.restore();
      return [full];
    }
    const abbr = SUB_ABBR[full] || full;
    ctx.restore();
    return [abbr];
  }

  const abbrList = k.s.map(x => SUB_ABBR[x] || x);

  // 2. Can all full names fit on 1 line?
  const fullJoined = k.s.join(', ');
  if (ctx.measureText(fullJoined).width <= maxW) {
    ctx.restore();
    return [fullJoined];
  }

  // 3. Can comma-separated abbreviations fit on 1 line?
  const abbrComma = abbrList.join(', ');
  if (ctx.measureText(abbrComma).width <= maxW) {
    ctx.restore();
    return [abbrComma];
  }

  // 4. Can compact space-separated abbreviations fit on 1 line?
  const compact = abbrList.join(' ');
  if (ctx.measureText(compact).width <= maxW) {
    ctx.restore();
    return [compact];
  }

  // 5. Multi-line wrapping: balanced distribution so no items are ever dropped
  const lineLimit = Math.max(maxW, 80);
  const targetPerLine = (abbrList.length === 4 && lineLimit < 115) ? 2 : (abbrList.length > 4 ? 3 : Infinity);

  const lines = [];
  let cur = [];
  let curW = 0;
  const spaceW = ctx.measureText(' ').width;

  for (const abbr of abbrList) {
    const w = ctx.measureText(abbr).width;
    if (cur.length === 0) {
      cur.push(abbr);
      curW = w;
    } else if (cur.length < targetPerLine && (curW + spaceW + w <= lineLimit)) {
      cur.push(abbr);
      curW += spaceW + w;
    } else {
      lines.push(cur.join(' '));
      cur = [abbr];
      curW = w;
    }
  }
  if (cur.length) {
    lines.push(cur.join(' '));
  }

  ctx.restore();
  return lines;
}

function getSmartSubLabel(ctx, k, maxW = Infinity) {
  const lines = getSmartSubLines(ctx, k, maxW);
  return lines.join(' ');
}

/* ---------- Canvas Fonts & Dimensions ---------- */
const FONT_TOKEN = '28px "Times New Roman",Georgia,serif',
      FONT_POS_LABEL = '14px system-ui,Arial,sans-serif',
      FONT_POS_SUB = '12px system-ui,Arial,sans-serif',
      FONT_HEADER_INFO = 'italic 14px system-ui,Arial,sans-serif';

const F = FONT_TOKEN,
      FL = FONT_POS_LABEL,
      FS_ = FONT_POS_SUB,
      FB = FONT_HEADER_INFO;

const MARGIN_TOP = 8, PADDING_X = 30, CLAUSE_RADIUS = 22, MEMBER_RADIUS = 24;
const TOP = MARGIN_TOP, PX = PADDING_X, CR = CLAUSE_RADIUS, MR = MEMBER_RADIUS;

/* ---------- state ---------- */
const ta = $('ta'), cv = $('cv'), wrap = $('wrap');
let VIEW = 'grid',
    TL = 'ru';

let isFullHeight = false;
const DEFAULT_POS_ITEMS = {
  n: true, v: true, adj: true, pron: true, adv: true, num: true,
  art: true, prep: true, conj: true, part: true, det: true, int: true,
  subs: true
};

const DEFAULT_PARTS_ITEMS = {
  'Subject': true, 'Predicate': true, 'Predicative': true,
  'Direct object': true, 'Indirect object': true, 'Prepositional object': true,
  'Attribute': true, 'Apposition': true,
  'AdvM manner': true, 'AdvM place': true, 'AdvM time': true,
  'AdvM frequency': true, 'AdvM degree': true, 'AdvM cause': true,
  'AdvM purpose': true, 'AdvM condition': true, 'AdvM concession': true,
  'Introductory element': true, 'Address': true
};

const DEFAULT_CLAUSES_ITEMS = {
  'Main clause': true, 'Coordinate clause': true, 'Subject clause': true, 'Predicative clause': true,
  'Object clause': true, 'Attributive clause (defining)': true, 'Attributive clause (non-defining)': true,
  'AdvCl time': true, 'AdvCl place': true, 'AdvCl cause': true, 'AdvCl purpose': true,
  'AdvCl condition': true, 'AdvCl concession': true, 'AdvCl manner': true, 'AdvCl result': true, 'AdvCl comparison': true,
  'Prepositional phrase': true, 'Infinitive phrase': true, 'Gerund phrase': true, 'Participial phrase': true,
  'Absolute construction': true, 'Complex object': true, 'Complex subject': true, 'Noun phrase': true, 'Verb phrase': true
};

const DEFAULT_TENSES_ITEMS = {
  'Present': true, 'Past': true, 'Future': true,
  'Simple': true, 'Continuous': true, 'Perfect': true, 'Perfect Continuous': true,
  'Active': true, 'Passive': true,
  'Indicative': true, 'Imperative': true, 'Subjunctive': true, 'Conditional': true
};

const DEFAULT_ST_ITEMS = {
  'Simple': true, 'Compound': true, 'Complex': true, 'Compound-complex': true,
  'Declarative': true, 'Interrogative': true, 'Imperative': true, 'Exclamatory': true,
  'General': true, 'Special': true, 'Alternative': true, 'Disjunctive': true,
  'Affirmative': true, 'Negative': true
};

function ensureLayerItems(target = aiLayers) {
  if (!target) return target;
  if (!target.pos_items || typeof target.pos_items !== 'object') target.pos_items = { ...DEFAULT_POS_ITEMS };
  else target.pos_items = { ...DEFAULT_POS_ITEMS, ...target.pos_items };

  if (!target.parts_items || typeof target.parts_items !== 'object') target.parts_items = { ...DEFAULT_PARTS_ITEMS };
  else target.parts_items = { ...DEFAULT_PARTS_ITEMS, ...target.parts_items };

  if (!target.clauses_items || typeof target.clauses_items !== 'object') target.clauses_items = { ...DEFAULT_CLAUSES_ITEMS };
  else target.clauses_items = { ...DEFAULT_CLAUSES_ITEMS, ...target.clauses_items };

  if (!target.tenses_items || typeof target.tenses_items !== 'object') target.tenses_items = { ...DEFAULT_TENSES_ITEMS };
  else target.tenses_items = { ...DEFAULT_TENSES_ITEMS, ...target.tenses_items };

  if (!target.st_items || typeof target.st_items !== 'object') target.st_items = { ...DEFAULT_ST_ITEMS };
  else target.st_items = { ...DEFAULT_ST_ITEMS, ...target.st_items };

  return target;
}

function getFilteredVerbFormLabel(a, filter) {
  if (!filter) return a.v;
  let tokens = [];
  if (Array.isArray(a.f) && a.f.length) {
    tokens = [...a.f];
  } else if (typeof a.v === 'string') {
    let s = a.v.replace(/\bPerfect\s+Continuous\b/g, '__PERF_CONT__');
    const words = s.trim().split(/\s+/).filter(Boolean);
    tokens = words.map(w => w === '__PERF_CONT__' ? 'Perfect Continuous' : w);
  }

  const kept = tokens.filter(tok => {
    if (filter[tok] === false) return false;
    return true;
  });

  if (!kept.length) return null;
  return kept.join(' ');
}

const LAYER_CONFIGS = {
  pos: {
    id: 'pos',
    icon: '',
    title: 'Части речи',
    titleEn: 'Parts of speech',
    tip: 'Показывать части речи над словами (существительное, глагол и т.д.)',
    itemsKey: 'pos_items',
    defaults: DEFAULT_POS_ITEMS,
    groups: [
      {
        title: 'Основные части речи',
        titleEn: 'Main parts of speech',
        items: [
          { key: 'n', name: 'Noun', ru: 'Существительное', abbr: 'n.' },
          { key: 'v', name: 'Verb', ru: 'Глагол', abbr: 'v.' },
          { key: 'adj', name: 'Adjective', ru: 'Прилагательное', abbr: 'adj.' },
          { key: 'pron', name: 'Pronoun', ru: 'Местоимение', abbr: 'pron.' },
          { key: 'adv', name: 'Adverb', ru: 'Наречие', abbr: 'adv.' },
          { key: 'num', name: 'Numeral', ru: 'Числительное', abbr: 'num.' },
          { key: 'art', name: 'Article', ru: 'Артикль', abbr: 'art.' },
          { key: 'prep', name: 'Preposition', ru: 'Предлог', abbr: 'prep.' },
          { key: 'conj', name: 'Conjunction', ru: 'Союз', abbr: 'conj.' },
          { key: 'part', name: 'Particle', ru: 'Частица', abbr: 'part.' },
          { key: 'det', name: 'Determiner', ru: 'Детерминатив', abbr: 'det.' },
          { key: 'int', name: 'Interjection', ru: 'Междометие', abbr: 'int.' }
        ]
      },
      {
        title: 'Морфологические детали',
        titleEn: 'Morphology details',
        items: [
          { key: 'subs', name: 'Sub-tags', ru: 'Подкатегории (count, pl, trans…)', abbr: 'subs' }
        ]
      }
    ]
  },
  parts: {
    id: 'parts',
    icon: '',
    title: 'Члены предложения',
    titleEn: 'Sentence parts',
    tip: 'Показывать члены предложения и подчеркивания (подлежащее, сказуемое, дополнение и т.д.)',
    itemsKey: 'parts_items',
    defaults: DEFAULT_PARTS_ITEMS,
    groups: [
      {
        title: 'Главные члены (Core)',
        titleEn: 'Core elements',
        items: [
          { key: 'Subject', name: 'Subject', ru: 'Подлежащее', abbr: 'Subj' },
          { key: 'Predicate', name: 'Predicate', ru: 'Сказуемое', abbr: 'Pred' },
          { key: 'Predicative', name: 'Predicative', ru: 'Предикатив', abbr: 'Pred-ve' }
        ]
      },
      {
        title: 'Дополнения (Objects)',
        titleEn: 'Objects',
        items: [
          { key: 'Direct object', name: 'Direct object', ru: 'Прямое дополнение', abbr: 'Obj.dir' },
          { key: 'Indirect object', name: 'Indirect object', ru: 'Косвенное дополнение', abbr: 'Obj.ind' },
          { key: 'Prepositional object', name: 'Prepositional object', ru: 'Предложное дополнение', abbr: 'Obj.prep' }
        ]
      },
      {
        title: 'Определения (Attributes)',
        titleEn: 'Attributes',
        items: [
          { key: 'Attribute', name: 'Attribute', ru: 'Определение', abbr: 'Attr' },
          { key: 'Apposition', name: 'Apposition', ru: 'Приложение', abbr: 'Appos' }
        ]
      },
      {
        title: 'Обстоятельства (Adverbials)',
        titleEn: 'Adverbial modifiers',
        items: [
          { key: 'AdvM manner', name: 'AdvM manner', ru: 'Обст. образа действия', abbr: 'AdvM.man' },
          { key: 'AdvM place', name: 'AdvM place', ru: 'Обст. места', abbr: 'AdvM.pl' },
          { key: 'AdvM time', name: 'AdvM time', ru: 'Обст. времени', abbr: 'AdvM.tm' },
          { key: 'AdvM frequency', name: 'AdvM frequency', ru: 'Обст. частоты', abbr: 'AdvM.frq' },
          { key: 'AdvM degree', name: 'AdvM degree', ru: 'Обст. степени', abbr: 'AdvM.deg' },
          { key: 'AdvM cause', name: 'AdvM cause', ru: 'Обст. причины', abbr: 'AdvM.caus' },
          { key: 'AdvM purpose', name: 'AdvM purpose', ru: 'Обст. цели', abbr: 'AdvM.purp' },
          { key: 'AdvM condition', name: 'AdvM condition', ru: 'Обст. условия', abbr: 'AdvM.cond' },
          { key: 'AdvM concession', name: 'AdvM concession', ru: 'Обст. уступки', abbr: 'AdvM.conc' }
        ]
      },
      {
        title: 'Прочие элементы (Other)',
        titleEn: 'Other elements',
        items: [
          { key: 'Introductory element', name: 'Introductory element', ru: 'Вводный элемент', abbr: 'Intro' },
          { key: 'Address', name: 'Address', ru: 'Обращение', abbr: 'Addr' }
        ]
      }
    ]
  },
  clauses: {
    id: 'clauses',
    icon: '',
    title: 'Придаточные и обороты',
    titleEn: 'Clauses & phrases',
    tip: 'Показывать придаточные предложения и синтаксические обороты сверху скобками',
    itemsKey: 'clauses_items',
    defaults: DEFAULT_CLAUSES_ITEMS,
    groups: [
      {
        title: 'Придаточные предложения (Clauses)',
        titleEn: 'Clauses',
        items: [
          { key: 'Main clause', name: 'Main clause', ru: 'Главное предложение', abbr: 'Main cl' },
          { key: 'Coordinate clause', name: 'Coordinate clause', ru: 'Сочиненное предложение', abbr: 'Coord cl' },
          { key: 'Subject clause', name: 'Subject clause', ru: 'Придаточное подлежащее', abbr: 'Subj cl' },
          { key: 'Predicative clause', name: 'Predicative clause', ru: 'Придаточное предикатив', abbr: 'Pred cl' },
          { key: 'Object clause', name: 'Object clause', ru: 'Придаточное дополнение', abbr: 'Obj cl' },
          { key: 'Attributive clause (defining)', name: 'Attributive clause (def.)', ru: 'Определительное (индивид.)', abbr: 'Attr cl def' },
          { key: 'Attributive clause (non-defining)', name: 'Attributive clause (non-def.)', ru: 'Определительное (описат.)', abbr: 'Attr cl non-def' }
        ]
      },
      {
        title: 'Обстоятельственные придаточные (Adverbials)',
        titleEn: 'Adverbial clauses',
        items: [
          { key: 'AdvCl time', name: 'AdvCl time', ru: 'Придаточное времени', abbr: 'ACl.tm' },
          { key: 'AdvCl place', name: 'AdvCl place', ru: 'Придаточное места', abbr: 'ACl.pl' },
          { key: 'AdvCl cause', name: 'AdvCl cause', ru: 'Придаточное причины', abbr: 'ACl.caus' },
          { key: 'AdvCl purpose', name: 'AdvCl purpose', ru: 'Придаточное цели', abbr: 'ACl.purp' },
          { key: 'AdvCl condition', name: 'AdvCl condition', ru: 'Придаточное условия', abbr: 'ACl.cond' },
          { key: 'AdvCl concession', name: 'AdvCl concession', ru: 'Придаточное уступки', abbr: 'ACl.conc' },
          { key: 'AdvCl manner', name: 'AdvCl manner', ru: 'Придаточное образа действия', abbr: 'ACl.man' },
          { key: 'AdvCl result', name: 'AdvCl result', ru: 'Придаточное следствия', abbr: 'ACl.res' },
          { key: 'AdvCl comparison', name: 'AdvCl comparison', ru: 'Придаточное сравнения', abbr: 'ACl.comp' }
        ]
      },
      {
        title: 'Обороты и синтаксические группы (Phrases)',
        titleEn: 'Phrases & constructions',
        items: [
          { key: 'Prepositional phrase', name: 'Prepositional phrase', ru: 'Предложный оборот', abbr: 'Prep phr' },
          { key: 'Infinitive phrase', name: 'Infinitive phrase', ru: 'Инфинитивный оборот', abbr: 'Inf phr' },
          { key: 'Gerund phrase', name: 'Gerund phrase', ru: 'Герундиальный оборот', abbr: 'Ger phr' },
          { key: 'Participial phrase', name: 'Participial phrase', ru: 'Причастный оборот', abbr: 'Part phr' },
          { key: 'Absolute construction', name: 'Absolute construction', ru: 'Абсолютная конструкция', abbr: 'Abs constr' },
          { key: 'Complex object', name: 'Complex object', ru: 'Сложное дополнение', abbr: 'Comp obj' },
          { key: 'Complex subject', name: 'Complex subject', ru: 'Сложное подлежащее', abbr: 'Comp subj' },
          { key: 'Noun phrase', name: 'Noun phrase', ru: 'Именная группа (NP)', abbr: 'NP' },
          { key: 'Verb phrase', name: 'Verb phrase', ru: 'Глагольная группа (VP)', abbr: 'VP' }
        ]
      }
    ]
  },
  tenses: {
    id: 'tenses',
    icon: '',
    title: 'Время и залог',
    titleEn: 'Tense & voice',
    tip: 'Показывать время, залог и наклонение глаголов (Pres. Simp. Act. Ind.)',
    itemsKey: 'tenses_items',
    defaults: DEFAULT_TENSES_ITEMS,
    groups: [
      {
        title: 'Время (Tense)',
        titleEn: 'Tense',
        items: [
          { key: 'Present', name: 'Present', ru: 'Настоящее время', abbr: 'Pres.' },
          { key: 'Past', name: 'Past', ru: 'Прошедшее время', abbr: 'Past' },
          { key: 'Future', name: 'Future', ru: 'Будущее время', abbr: 'Fut.' }
        ]
      },
      {
        title: 'Вид (Aspect)',
        titleEn: 'Aspect',
        items: [
          { key: 'Simple', name: 'Simple', ru: 'Простое', abbr: 'Simp.' },
          { key: 'Continuous', name: 'Continuous', ru: 'Длительное', abbr: 'Cont.' },
          { key: 'Perfect', name: 'Perfect', ru: 'Совершенное', abbr: 'Perf.' },
          { key: 'Perfect Continuous', name: 'Perfect Continuous', ru: 'Длительно-совершенное', abbr: 'Perf. Cont.' }
        ]
      },
      {
        title: 'Залог (Voice)',
        titleEn: 'Voice',
        items: [
          { key: 'Active', name: 'Active', ru: 'Действительный залог', abbr: 'Act.' },
          { key: 'Passive', name: 'Passive', ru: 'Страдательный залог', abbr: 'Pass.' }
        ]
      },
      {
        title: 'Наклонение (Mood)',
        titleEn: 'Mood',
        items: [
          { key: 'Indicative', name: 'Indicative', ru: 'Изъявительное', abbr: 'Ind.' },
          { key: 'Imperative', name: 'Imperative', ru: 'Повелительное', abbr: 'Imp.' },
          { key: 'Subjunctive', name: 'Subjunctive', ru: 'Сослагательное', abbr: 'Subj.' },
          { key: 'Conditional', name: 'Conditional', ru: 'Условное', abbr: 'Cond.' }
        ]
      }
    ]
  },
  st: {
    id: 'st',
    icon: '',
    title: 'Тип предложения',
    titleEn: 'Sentence type',
    tip: 'Показывать классификацию предложения (Sentence: Compound-complex...)',
    itemsKey: 'st_items',
    defaults: DEFAULT_ST_ITEMS,
    groups: [
      {
        title: 'Структура (Structure)',
        titleEn: 'Structure',
        items: [
          { key: 'Simple', name: 'Simple', ru: 'Простое предложение', abbr: 'Simple' },
          { key: 'Compound', name: 'Compound', ru: 'Сложносочиненное', abbr: 'Compound' },
          { key: 'Complex', name: 'Complex', ru: 'Сложноподчиненное', abbr: 'Complex' },
          { key: 'Compound-complex', name: 'Compound-complex', ru: 'Смешанное', abbr: 'C-C' }
        ]
      },
      {
        title: 'Цель высказывания (Purpose)',
        titleEn: 'Purpose',
        items: [
          { key: 'Declarative', name: 'Declarative', ru: 'Повествовательное', abbr: 'Decl.' },
          { key: 'Interrogative', name: 'Interrogative', ru: 'Вопросительное', abbr: 'Interrog.' },
          { key: 'Imperative', name: 'Imperative', ru: 'Побудительное', abbr: 'Imp.' },
          { key: 'Exclamatory', name: 'Exclamatory', ru: 'Восклицательное', abbr: 'Excl.' }
        ]
      },
      {
        title: 'Тип вопроса (Question type)',
        titleEn: 'Question type',
        items: [
          { key: 'General', name: 'General', ru: 'Общий вопрос (Yes/No)', abbr: 'Gen.' },
          { key: 'Special', name: 'Special', ru: 'Специальный вопрос (Wh-)', abbr: 'Spec.' },
          { key: 'Alternative', name: 'Alternative', ru: 'Альтернативный вопрос (or)', abbr: 'Alt.' },
          { key: 'Disjunctive', name: 'Disjunctive', ru: 'Разделительный (Tag)', abbr: 'Disj.' }
        ]
      },
      {
        title: 'Утверждение / Отрицание (Polarity)',
        titleEn: 'Polarity',
        items: [
          { key: 'Affirmative', name: 'Affirmative', ru: 'Утвердительное', abbr: 'Affirm.' },
          { key: 'Negative', name: 'Negative', ru: 'Отрицательное', abbr: 'Neg.' }
        ]
      }
    ]
  }
};

let aiLayers = {
  pos: true,
  parts: true,
  clauses: true,
  tenses: true,
  st: true,
  pos_items: { ...DEFAULT_POS_ITEMS },
  parts_items: { ...DEFAULT_PARTS_ITEMS },
  clauses_items: { ...DEFAULT_CLAUSES_ITEMS },
  tenses_items: { ...DEFAULT_TENSES_ITEMS },
  st_items: { ...DEFAULT_ST_ITEMS }
};

let dockLayout = {
  topFull: [],
  columns: [
    ['m', 'c', 's'],
    ['pos', 'f']
  ],
  bottomFull: []
};

const L = (r, e) => TL === 'ru' ? r : e;

const TAB_LOCALES = {
  m: ['Члены предложения', 'Sentence parts'],
  pos: ['Части речи', 'Part of speech'],
  c: ['Обороты и придаточные', 'Clauses & phrases'],
  f: ['Время · залог · наклонение', 'Tense · voice · mood'],
  s: ['Тип предложения', 'Sentence type'],
  ai: ['Проверка ИИ', 'AI check']
};
const getTabTitle = k => {
  const item = TAB_LOCALES[k];
  return item ? (TL === 'ru' ? item[0] : item[1]) : k;
};

const G_LOCALES = {
  'Core': ['Главные члены', 'Core elements'],
  'Objects': ['Дополнения', 'Objects'],
  'Attributes': ['Определения', 'Attributes'],
  'Adverbial modifiers': ['Обстоятельства', 'Adverbial modifiers'],
  'Other': ['Прочее', 'Other elements'],
  'Clauses': ['Придаточные предложения', 'Clauses'],
  'Adverbial clauses': ['Обстоятельственные придаточные', 'Adverbial clauses'],
  'Phrases & constructions': ['Обороты и конструкции', 'Phrases & constructions'],
  'Tense': ['Время', 'Tense'],
  'Aspect': ['Вид', 'Aspect'],
  'Voice': ['Залог', 'Voice'],
  'Mood': ['Наклонение', 'Mood'],
  'Structure': ['Структура предложения', 'Sentence structure'],
  'Purpose': ['Цель высказывания', 'Sentence purpose'],
  'Question type': ['Тип вопроса', 'Question type'],
  'Polarity': ['Полярность', 'Polarity']
};
const getGroupTitle = g => {
  const item = G_LOCALES[g];
  return item ? (TL === 'ru' ? item[0] : item[1]) : g;
};

const AUTO_100_RULES_INFO = {
  articles: {
    name: ['Артикли (Articles)', 'Articles (Articles)'],
    desc: ['<code>a, an</code> (indefinite) и <code>the</code> (definite)', '<code>a, an</code> (indefinite) and <code>the</code> (definite)']
  },
  pronouns_cases: {
    name: ['Однозначные местоимения и падежи (Pronouns)', 'Unambiguous pronouns & cases (Pronouns)'],
    desc: ['Именительный: <code>I, he, she, we, they</code>; Объектный: <code>me, him, us, them</code>; Возвратные: <code>myself...</code>; Абсолютные: <code>mine, yours, theirs</code>; Неопределенные/Отрицательные: <code>someone, nobody...</code>', 'Nominative: <code>I, he, she, we, they</code>; Objective: <code>me, him, us, them</code>; Reflexive: <code>myself...</code>; Absolute: <code>mine, yours, theirs</code>; Indefinite/Negative: <code>someone, nobody...</code>']
  },
  numerals: {
    name: ['Числительные (Numerals)', 'Numerals (Numerals)'],
    desc: ['Цифры (<code>42, 2026</code> → cardinal), порядковые с суффиксом (<code>1st, 2nd, 3rd</code> → ordinal) и числа словами (<code>two, three... tenth, hundredth</code>)', 'Digits (<code>42, 2026</code> → cardinal), ordinals with suffix (<code>1st, 2nd, 3rd</code> → ordinal) and number words (<code>two, three... tenth, hundredth</code>)']
  },
  calendar_proper: {
    name: ['Календарные имена собственные (Proper Nouns)', 'Calendar proper nouns (Proper Nouns)'],
    desc: ['Дни недели (<code>Monday...Sunday</code>) и месяцы (<code>January...December</code>, кроме омонимов May/March)', 'Days of the week (<code>Monday...Sunday</code>) and months (<code>January...December</code>, except homonyms May/March)']
  },
  particles_conj: {
    name: ['Однозначные союзы и отрицание (Conjunctions & Particles)', 'Unambiguous conjunctions & negation (Conjunctions & Particles)'],
    desc: ['Частица <code>not, n\'t</code> (negative); союзы <code>and, nor</code> (coordinating); <code>because, although, whereas, unless</code> (subordinating)', 'Particle <code>not, n\'t</code> (negative); conjunctions <code>and, nor</code> (coordinating); <code>because, although, whereas, unless</code> (subordinating)']
  },
  pure_prepositions: {
    name: ['Безусловные предлоги (Pure Prepositions)', 'Pure prepositions (Pure Prepositions)'],
    desc: ['Только слова, которые в английском никогда не бывают наречиями: <code>of, into, onto, upon, among, between, during, toward, throughout, against</code>', 'Words that never act as adverbs in English: <code>of, into, onto, upon, among, between, during, toward, throughout, against</code>']
  },
  modals: {
    name: ['Модальные глаголы без омонимов (Modal Verbs)', 'Modal verbs without homonyms (Modal Verbs)'],
    desc: ['Строгие модальные глаголы: <code>must, should, would, could</code> (исключая омонимы can/will/may)', 'Strict modal verbs: <code>must, should, would, could</code> (excluding homonyms can/will/may)']
  },
  sentence_purpose: {
    name: ['Цель высказывания по пунктуации (Purpose)', 'Sentence purpose by punctuation (Purpose)'],
    desc: ['<code>!</code> → Exclamatory; <code>?</code> → Interrogative (+ Wh-вопросы → Special); <code>.</code> → Declarative', '<code>!</code> → Exclamatory; <code>?</code> → Interrogative (+ Wh-questions → Special); <code>.</code> → Declarative']
  },
  sentence_polarity: {
    name: ['Полярность: утверждение / отрицание (Polarity)', 'Polarity: affirmative / negative (Polarity)'],
    desc: ['100% Negative при наличии <code>not, n\'t, never, nobody, nothing, nowhere, neither, none</code>; иначе Affirmative', '100% Negative with <code>not, n\'t, never, nobody, nothing, nowhere, neither, none</code>; otherwise Affirmative']
  },
  passive_voice: {
    name: ['Пассивный залог глаголов (Passive Voice)', 'Passive voice in verbs (Passive Voice)'],
    desc: ['Аналитическая цепочка <code>be / been / being + Participle II</code> (<i>“should be disregarded”</i>) → Voice: Passive', 'Analytical chain <code>be / been / being + Participle II</code> (<i>“should be disregarded”</i>) → Voice: Passive']
  },
  subject_pronouns: {
    name: ['Подлежащее при именительном местоимении (Subject)', 'Subject with nominative pronoun (Subject)'],
    desc: ['<code>I, he, she, we, they</code> непосредственно перед личным глаголом (<i>“that <u>I</u> want”</i>, <i>“<u>he</u> rises”</i>) → Subject', '<code>I, he, she, we, they</code> directly before finite verb (<i>“that <u>I</u> want”</i>, <i>“<u>he</u> rises”</i>) → Subject']
  },
  address_vocative: {
    name: ['Обращение перед запятой (Address)', 'Direct address before comma (Address)'],
    desc: ['Вокативное существительное в начале реплики перед запятой (<i>“<u>Gentlemen</u>, it is...”</i>) → Address', 'Vocative noun at turn beginning before comma (<i>“<u>Gentlemen</u>, it is...”</i>) → Address']
  }
};

const PROVIDERS = {
  positionapi: {
    name: 'PositionAPI (positionapi.top)',
    base: 'https://positionapi.top/v1',
    keyPlaceholder: 'PositionAPI Key (sk-…)',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'deepseek-chat', 'gpt-6-astra']
  },
  groq: {
    name: 'Groq Cloud (Ultra-fast)',
    base: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'Groq API Key (gsk_…)',
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
      'allam-2-7b'
    ]
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    base: '',
    keyPlaceholder: 'API Key (optional/sk-…)',
    defaultModel: 'gpt-4o',
    models: []
  }
};

let AI = {
  provider: 'positionapi',
  keys: {
    positionapi: '',
    groq: '',
    custom: ''
  },
  models: {
    positionapi: [...PROVIDERS.positionapi.models],
    groq: [...PROVIDERS.groq.models],
    custom: []
  },
  activeModel: {
    positionapi: 'gpt-4o',
    groq: 'openai/gpt-oss-120b',
    custom: 'gpt-4o'
  },
  customUrl: 'http://localhost:11434/v1',
  lang: 'Russian',
  hasKey: false
};

let AIR = '', AII = [];
let currentTopMode = 'manual'; // 'manual' | 'ai'
let currentTheme = 'light'; // 'light' | 'dark'

function setTheme(theme, save = true) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  const sun = $('ic-theme-sun');
  const moon = $('ic-theme-moon');
  if (sun && moon) {
    sun.style.display = currentTheme === 'dark' ? 'none' : 'block';
    moon.style.display = currentTheme === 'dark' ? 'block' : 'none';
  }
  const btn = $('btn-theme-toggle');
  if (btn) {
    btn.setAttribute('title', currentTheme === 'dark'
      ? L('Тема: Тёмная (нажмите для переключения на светлую)', 'Theme: Dark (click for light)')
      : L('Тема: Светлая (нажмите для переключения на тёмную)', 'Theme: Light (click for dark)'));
  }
  if (save) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ foma_theme: currentTheme });
    }
  }
  render();
  if (currentTopMode === 'ai' || currentAiIdeal) {
    const loading = $('ai-loading-state');
    if (!loading || loading.style.display === 'none') {
      if (typeof renderAiCanvas === 'function') renderAiCanvas();
    }
  }
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
}
let lastAiFilledText = '';
let lastAiFilledModel = '';
let lastAiFilledLatency = '';
let lastAiVerdict = null;
let isAiFilling = false;

let toks = [], an = [], sel = [], anc = -1, last = -1, tab = 'm', editing = false,
    FS = ['', '', '', ''], ST = ['', '', '', ''], Ls = [], hits = [], above = [], below = [];

let activeLayer = 'parts'; // 'parts' | 'pos' | 'clauses' | 'tenses' | 'st'
let renderMode = 'color_focus'; // 'color_focus' | 'bw'
let showWordPopover = true;
let wordPopoverLayout = 'row'; // 'row' | 'column'
let partsFormat = 'combo'; // 'combo' | 'full' | 'short' | 'symbols_only'
let showProgressBar = true;

try {
  const savedRMode = localStorage.getItem('foma_render_mode');
  if (savedRMode === 'bw' || savedRMode === 'color_focus') renderMode = savedRMode;
  const savedPopover = localStorage.getItem('foma_show_word_popover');
  if (savedPopover !== null) showWordPopover = (savedPopover !== '0' && savedPopover !== 'false');
  const savedLayout = localStorage.getItem('foma_word_popover_layout');
  if (savedLayout === 'column' || savedLayout === 'row') wordPopoverLayout = savedLayout;
  const savedFormat = localStorage.getItem('foma_parts_format');
  if (['combo', 'full', 'short', 'symbols_only'].includes(savedFormat)) partsFormat = savedFormat;
  const savedProgress = localStorage.getItem('foma_show_progress_bar');
  if (savedProgress !== null) showProgressBar = (savedProgress !== '0' && savedProgress !== 'false');
} catch (_) {}

const LAYER_COLORS = {
  pos: '#10b981',       // Emerald/Teal (Части речи)
  parts: '#818cf8',     // Indigo/Violet (Члены предложения)
  clauses: '#d97706',   // Amber/Brown (Придаточные и обороты)
  tenses: '#eab308',    // Gold/Yellow (Время и залог)
  st: '#ec4899'         // Rose/Magenta (Тип предложения)
};

const LAYER_SHORT_NAMES = {
  pos: ['Части речи', 'Parts of speech'],
  parts: ['Члены', 'Sentence parts'],
  clauses: ['Придаточные', 'Clauses'],
  tenses: ['Время', 'Tense · voice'],
  st: ['Тип', 'Sentence type']
};

/* Semantic grammatical colors for Color focus mode (Full Light/Dark parity) */
const PART_COLORS = {
  'Subject': { light: '#2563eb', dark: '#60a5fa' },              // Blue (Подлежащее)
  'Predicate': { light: '#dc2626', dark: '#f87171' },            // Red (Сказуемое)
  'Predicative': { light: '#e11d48', dark: '#fb7185' },          // Rose (Предикатив)
  'Direct object': { light: '#7c3aed', dark: '#a78bfa' },        // Violet (Прямое дополнение)
  'Indirect object': { light: '#9333ea', dark: '#c084fc' },      // Purple (Косвенное дополнение)
  'Prepositional object': { light: '#4f46e5', dark: '#818cf8' }, // Indigo (Предложное дополнение)
  'Attribute': { light: '#059669', dark: '#34d399' },            // Emerald Green (Определение)
  'Apposition': { light: '#0d9488', dark: '#2dd4bf' },           // Teal (Приложение)
  'AdvM manner': { light: '#b45309', dark: '#fbbf24' },          // Amber (Обст. образа действия)
  'AdvM place': { light: '#d97706', dark: '#fbbf24' },           // Amber (Обст. места)
  'AdvM time': { light: '#b45309', dark: '#f59e0b' },            // Amber (Обст. времени)
  'AdvM frequency': { light: '#d97706', dark: '#fbbf24' },       // Amber (Обст. частоты)
  'AdvM degree': { light: '#b45309', dark: '#f59e0b' },          // Amber (Обст. степени)
  'AdvM cause': { light: '#d97706', dark: '#fbbf24' },           // Amber (Обст. причины)
  'AdvM purpose': { light: '#b45309', dark: '#f59e0b' },         // Amber (Обст. цели)
  'AdvM condition': { light: '#d97706', dark: '#fbbf24' },       // Amber (Обст. условия)
  'AdvM concession': { light: '#b45309', dark: '#f59e0b' },      // Amber (Обст. уступки)
  'Introductory element': { light: '#0891b2', dark: '#38bdf8' }, // Cyan (Вводный элемент)
  'Address': { light: '#0284c7', dark: '#38bdf8' }               // Sky (Обращение)
};

function getPartColor(partName, isDark = false) {
  if (PART_COLORS[partName]) {
    return isDark ? PART_COLORS[partName].dark : PART_COLORS[partName].light;
  }
  if (typeof partName === 'string' && partName.startsWith('AdvM')) {
    return isDark ? '#fbbf24' : '#b45309';
  }
  return isDark ? '#a78bfa' : '#7c3aed';
}

const CLAUSE_COLORS = {
  'Main clause': { light: '#2563eb', dark: '#60a5fa' },
  'Coordinate clause': { light: '#4f46e5', dark: '#818cf8' },
  'Subject clause': { light: '#0284c7', dark: '#38bdf8' },
  'Predicative clause': { light: '#e11d48', dark: '#fb7185' },
  'Object clause': { light: '#7c3aed', dark: '#a78bfa' },
  'Attributive clause (defining)': { light: '#059669', dark: '#34d399' },
  'Attributive clause (non-defining)': { light: '#0d9488', dark: '#2dd4bf' }
};

function getClauseColor(clauseName, isDark = false) {
  if (CLAUSE_COLORS[clauseName]) {
    return isDark ? CLAUSE_COLORS[clauseName].dark : CLAUSE_COLORS[clauseName].light;
  }
  if (typeof clauseName === 'string') {
    if (clauseName.startsWith('AdvCl')) return isDark ? '#fbbf24' : '#b45309';
    if (clauseName.includes('phrase') || clauseName.includes('construction') || clauseName.includes('Complex')) {
      return isDark ? '#c084fc' : '#9333ea';
    }
  }
  return isDark ? '#fbbf24' : '#d97706';
}

const POS_COLORS = {
  n: { light: '#0284c7', dark: '#38bdf8' },    // Noun: Sky
  v: { light: '#dc2626', dark: '#f87171' },    // Verb: Red
  adj: { light: '#059669', dark: '#34d399' },  // Adjective: Emerald
  adv: { light: '#b45309', dark: '#fbbf24' },  // Adverb: Amber
  pron: { light: '#4f46e5', dark: '#818cf8' }, // Pronoun: Indigo
  prep: { light: '#7c3aed', dark: '#a78bfa' }, // Preposition: Violet
  conj: { light: '#475569', dark: '#94a3b8' }, // Conjunction: Slate
  art: { light: '#64748b', dark: '#a1a1aa' },  // Article: Slate
  num: { light: '#ea580c', dark: '#fb923c' },  // Numeral: Orange
  part: { light: '#db2777', dark: '#f472b6' }, // Particle: Pink
  det: { light: '#0d9488', dark: '#2dd4bf' },   // Determiner: Teal
  int: { light: '#c026d3', dark: '#e879f9' }   // Interjection: Magenta
};

function getPosColor(posKey, isDark = false) {
  if (POS_COLORS[posKey]) {
    return isDark ? POS_COLORS[posKey].dark : POS_COLORS[posKey].light;
  }
  return isDark ? '#34d399' : '#059669';
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const ss = () => [...sel].sort((a, b) => a - b);
const sorted = a => [...a.ix].sort((x, y) => x - y);
const subs = k => (k.s || []).join(', ');
const stLabel = () => ST.some(Boolean) ? 'Sentence: ' + ST.filter(Boolean).join(' · ') : '';
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const msg = t => $('msg').textContent = t;

/* ---------- tooltips (RU default / EN) ---------- */
const T = {};
const D = (p, o) => Object.entries(o).forEach(([k, v]) => T[p + k] = v);

D('m:', {
  'Subject': ["Подлежащее: о ком или о чём речь. Отвечает на «кто? что?». Пример: THE OLD MAN smiled.", "Who or what the sentence is about (who? what?). E.g. THE OLD MAN smiled."],
  'Predicate': ["Сказуемое: что говорится о подлежащем. Глагол или группа глаголов: has been working, can swim.", "What is said about the subject: a verb or verb group, e.g. has been working, can swim."],
  'Predicative': ["Именная часть составного сказуемого после глагола-связки: He is A TEACHER / HAPPY.", "The nominal part of a compound predicate after a link verb: He is A TEACHER / HAPPY."],
  'Indirect object': ["Косвенное дополнение: кому? для кого? без предлога. She gave HIM a book.", "Indirect object: to/for whom, without a preposition. She gave HIM a book."],
  'Direct object': ["Прямое дополнение: кого? что? без предлога. She read A BOOK.", "Direct object: whom/what, no preposition. She read A BOOK."],
  'Prepositional object': ["Предложное дополнение: дополнение с предлогом. He looked AT THE PICTURE.", "Object introduced by a preposition. He looked AT THE PICTURE."],
  'Attribute': ["Определение: какой? чей? который? a TALL man, JOHN'S book, the man IN THE HAT.", "Attribute: what kind? whose? which? a TALL man, JOHN'S book, the man IN THE HAT."],
  'Apposition': ["Приложение: существительное, называющее тот же предмет иначе. My friend, TOM, called.", "Apposition: a noun naming the same person/thing differently. My friend, TOM, called."],
  'AdvM manner': ["Обстоятельство образа действия: как? каким образом? She sings BEAUTIFULLY.", "Adverbial of manner: how? She sings BEAUTIFULLY."],
  'AdvM place': ["Обстоятельство места: где? куда? откуда? He lives IN LONDON.", "Adverbial of place: where? He lives IN LONDON."],
  'AdvM time': ["Обстоятельство времени: когда? как долго? We met YESTERDAY.", "Adverbial of time: when? how long? We met YESTERDAY."],
  'AdvM frequency': ["Обстоятельство частоты: как часто? He ALWAYS comes late.", "Adverbial of frequency: how often? He ALWAYS comes late."],
  'AdvM degree': ["Обстоятельство степени: в какой мере? It is VERY cold.", "Adverbial of degree: to what extent? It is VERY cold."],
  'AdvM cause': ["Обстоятельство причины: почему? He stayed BECAUSE OF THE RAIN.", "Adverbial of cause: why? He stayed BECAUSE OF THE RAIN."],
  'AdvM purpose': ["Обстоятельство цели: зачем? для чего? He came TO HELP.", "Adverbial of purpose: what for? He came TO HELP."],
  'AdvM condition': ["Обстоятельство условия: при каком условии? IN CASE OF FIRE, call 101.", "Adverbial of condition: under what condition? IN CASE OF FIRE, call 101."],
  'AdvM concession': ["Обстоятельство уступки: несмотря на что? DESPITE THE RAIN, we went out.", "Adverbial of concession: in spite of what? DESPITE THE RAIN, we went out."],
  'Introductory element': ["Вводный элемент: слово или оборот, не связанный с остальными членами: However, In fact, Well.", "Introductory element: a word/phrase not grammatically tied to the rest: However, In fact, Well."],
  'Address': ["Обращение: к кому говорящий обращается. TOM, come here.", "Address: the person spoken to. TOM, come here."]
});

D('c:', {
  'Main clause': ["Главное предложение: может стоять самостоятельно. HE SAID that it was late.", "Main clause: can stand alone. HE SAID that it was late."],
  'Coordinate clause': ["Сочинённая часть, равноправная с другой, через and / but / or: It rained, AND WE STAYED HOME.", "Coordinate clause joined by and / but / or: It rained, AND WE STAYED HOME."],
  'Subject clause': ["Подлежащное придаточное: выполняет роль подлежащего. WHAT HE SAID is true.", "Subject clause: plays the role of the subject. WHAT HE SAID is true."],
  'Predicative clause': ["Придаточное-предикатив: после глагола-связки. The problem is THAT HE LEFT.", "Predicative clause after a link verb. The problem is THAT HE LEFT."],
  'Object clause': ["Дополнительное придаточное: роль дополнения. I know THAT HE LEFT.", "Object clause: plays the role of an object. I know THAT HE LEFT."],
  'Attributive clause (defining)': ["Определительное придаточное (ограничительное), без запятых: The man WHO CAME is my uncle.", "Defining relative clause, no commas: The man WHO CAME is my uncle."],
  'Attributive clause (non-defining)': ["Определительное придаточное (пояснительное), в запятых: Tom, WHO CAME LATE, apologised.", "Non-defining relative clause, in commas: Tom, WHO CAME LATE, apologised."],
  'AdvCl time': ["Придаточное времени (when, after, before, until): WHEN HE CAME, we left.", "Time clause (when, after, before, until): WHEN HE CAME, we left."],
  'AdvCl place': ["Придаточное места (where, wherever): Stay WHERE YOU ARE.", "Place clause (where, wherever): Stay WHERE YOU ARE."],
  'AdvCl cause': ["Придаточное причины (because, since, as): We stayed BECAUSE IT RAINED.", "Cause clause (because, since, as): We stayed BECAUSE IT RAINED."],
  'AdvCl purpose': ["Придаточное цели (so that, in order that): He left early SO THAT HE COULD REST.", "Purpose clause (so that, in order that): He left early SO THAT HE COULD REST."],
  'AdvCl condition': ["Придаточное условия (if, unless, provided): IF IT RAINS, we will stay.", "Conditional clause (if, unless, provided): IF IT RAINS, we will stay."],
  'AdvCl concession': ["Придаточное уступки (although, though): ALTHOUGH IT RAINED, we went out.", "Concessive clause (although, though): ALTHOUGH IT RAINED, we went out."],
  'AdvCl manner': ["Придаточное образа действия (as, as if): He speaks AS IF HE KNEW everything.", "Manner clause (as, as if): He speaks AS IF HE KNEW everything."],
  'AdvCl result': ["Придаточное следствия (so … that): It was so cold THAT THE LAKE FROZE.", "Result clause (so … that): It was so cold THAT THE LAKE FROZE."],
  'AdvCl comparison': ["Придаточное сравнения (than, as … as): He is taller THAN I AM.", "Comparative clause (than, as … as): He is taller THAN I AM."],
  'Prepositional phrase': ["Предложная группа: предлог + существительное. IN THE PARK, ON MONDAY.", "Preposition + noun: IN THE PARK, ON MONDAY."],
  'Infinitive phrase': ["Инфинитивная группа: TO READ BOOKS is fun.", "Infinitive phrase: TO READ BOOKS is fun."],
  'Gerund phrase': ["Герундиальная группа: READING BOOKS is fun.", "Gerund phrase: READING BOOKS is fun."],
  'Participial phrase': ["Причастная группа: The man STANDING THERE is my uncle.", "Participial phrase: The man STANDING THERE is my uncle."],
  'Absolute construction': ["Независимый причастный оборот со своим подлежащим: WEATHER PERMITTING, we'll go.", "Absolute construction with its own subject: WEATHER PERMITTING, we'll go."],
  'Complex object': ["Сложное дополнение (объектный падеж с инфинитивом/причастием): I saw HIM LEAVE.", "Complex object (object + infinitive/participle): I saw HIM LEAVE."],
  'Complex subject': ["Сложное подлежащее (подлежащее + инфинитив): HE IS SAID TO BE rich.", "Complex subject (subject + infinitive): HE IS SAID TO BE rich."],
  'Noun phrase': ["Именная группа: существительное с зависимыми словами. THE OLD MAN.", "Noun phrase: a noun with its modifiers. THE OLD MAN."],
  'Verb phrase': ["Глагольная группа: смысловой глагол с вспомогательными. HAS BEEN WORKING.", "Verb phrase: main verb with auxiliaries. HAS BEEN WORKING."]
});

D('p:', {
  'n': ["Существительное: предмет, лицо, явление. table, Tom, idea.", "Noun: a thing, person or idea. table, Tom, idea."],
  'pron': ["Местоимение: замещает существительное. he, this, who.", "Pronoun: stands for a noun. he, this, who."],
  'adj': ["Прилагательное: признак предмета. big, red.", "Adjective: a quality of a noun. big, red."],
  'num': ["Числительное: количество или порядок. three, third.", "Numeral: quantity or order. three, third."],
  'v': ["Глагол: действие или состояние. run, be, can.", "Verb: an action or state. run, be, can."],
  'adv': ["Наречие: признак действия или признака. quickly, very.", "Adverb: describes an action or a quality. quickly, very."],
  'art': ["Артикль: служебное слово при существительном. a, an, the.", "Article: function word before a noun. a, an, the."],
  'prep': ["Предлог: связывает слово с существительным. in, on, with.", "Preposition: links a noun to the sentence. in, on, with."],
  'conj': ["Союз: соединяет слова и предложения. and, but, because.", "Conjunction: joins words or clauses. and, but, because."],
  'part': ["Частица: not, to (перед инфинитивом), only.", "Particle: not, to (before an infinitive), only."],
  'int': ["Междометие: эмоция. oh, wow.", "Interjection: an exclamation. oh, wow."],
  'det': ["Детерминатив/квантор: some, any, many, each, this.", "Determiner / quantifier: some, any, many, each, this."]
});

D('ps:', {
  'common': ["Нарицательное: общее название. a city.", "Common noun: a general name. a city."], 'proper': ["Собственное: имя, название. London.", "Proper noun: a name. London."],
  'countable': ["Исчисляемое: можно посчитать. book — books.", "Countable: can be counted. book — books."], 'uncountable': ["Неисчисляемое: water, advice.", "Uncountable: water, advice."],
  'concrete': ["Конкретное: можно воспринять органами чувств.", "Concrete: perceived by the senses."], 'abstract': ["Абстрактное: idea, freedom.", "Abstract: idea, freedom."],
  'collective': ["Собирательное: group, team.", "Collective: group, team."], 'material': ["Вещественное: gold, milk.", "Material: gold, milk."],
  'singular': ["Единственное число.", "Singular number."], 'plural': ["Множественное число.", "Plural number."],
  'common case': ["Общий падеж: boy.", "Common case: boy."], 'possessive case': ["Притяжательный падеж: boy's.", "Possessive case: boy's."],
  'personal': ["Личное: I, you, he, she, it, we, they.", "Personal: I, you, he, she, it, we, they."], 'possessive': ["Притяжательное: my, your, his, mine.", "Possessive: my, your, his, mine."],
  'reflexive': ["Возвратное: myself, himself.", "Reflexive: myself, himself."], 'demonstrative': ["Указательное: this, that, these, those.", "Demonstrative: this, that, these, those."],
  'interrogative': ["Вопросительное: who, what, which, where, when.", "Interrogative: who, what, which, where, when."], 'relative': ["Относительное: who, which, that.", "Relative: who, which, that."],
  'indefinite': ["Неопределённое: some, any, somebody.", "Indefinite: some, any, somebody."], 'negative': ["Отрицательное: no, nobody, nothing, not.", "Negative: no, nobody, nothing, not."],
  'reciprocal': ["Взаимное: each other, one another.", "Reciprocal: each other, one another."], 'defining': ["Определительное: all, each, every, both, other.", "Defining (universal): all, each, every, both, other."],
  'nominative': ["Именительный падеж: I, he, we.", "Nominative case: I, he, we."], 'objective': ["Объектный падеж: me, him, us.", "Objective case: me, him, us."],
  'conjoint': ["Присоединяемая форма: my book.", "Conjoint form: my book."], 'absolute': ["Абсолютная форма: mine, yours.", "Absolute form: mine, yours."],
  'qualitative': ["Качественное: big, kind.", "Qualitative: big, kind."],
  'positive': ["Положительная степень: big.", "Positive degree: big."], 'comparative': ["Сравнительная степень: bigger.", "Comparative degree: bigger."], 'superlative': ["Превосходная степень: biggest.", "Superlative degree: biggest."],
  'cardinal': ["Количественное: one, two.", "Cardinal: one, two."], 'ordinal': ["Порядковое: first, second.", "Ordinal: first, second."],
  'notional': ["Смысловой глагол.", "Notional verb."], 'auxiliary': ["Вспомогательный: be, have, do, will.", "Auxiliary: be, have, do, will."],
  'modal': ["Модальный: can, must, may, should.", "Modal: can, must, may, should."], 'link': ["Глагол-связка: be, become, seem.", "Link verb: be, become, seem."],
  'finite': ["Личная форма.", "Finite form."], 'infinitive': ["Инфинитив: to do.", "Infinitive: to do."], 'gerund': ["Герундий: doing.", "Gerund: doing."],
  'participle I': ["Причастие I: doing.", "Participle I: doing."], 'participle II': ["Причастие II: done.", "Participle II: done."],
  'regular': ["Правильный: + -ed.", "Regular: adds -ed."], 'irregular': ["Неправильный: go — went — gone.", "Irregular: go — went — gone."],
  'transitive': ["Переходный: с дополнением.", "Transitive: takes direct object."], 'intransitive': ["Непереходный.", "Intransitive."],
  'manner': ["Образа действия.", "Manner."], 'place': ["Места.", "Place."], 'time': ["Времени.", "Time."], 'frequency': ["Частоты.", "Frequency."], 'degree': ["Степени.", "Degree."],
  'definite': ["Определённый артикль: the.", "Definite article: the."], 'indefinite': ["Неопределённый артикль: a, an.", "Indefinite article: a, an."],
  'simple': ["Простой предлог: in, on.", "Simple preposition: in, on."], 'compound': ["Составной предлог: into, onto.", "Compound preposition."], 'phrasal': ["Предложная фраза.", "Phrasal preposition."],
  'direction': ["Направления.", "Direction."], 'cause': ["Причины.", "Cause."], 'other': ["Другое значение.", "Other meaning."],
  'coordinating': ["Сочинительный: and, but, or.", "Coordinating."], 'subordinating': ["Подчинительный: because, if.", "Subordinating."], 'correlative': ["Парный: both … and.", "Correlative."],
  'infinitive to': ["Частица to перед инфинитивом.", "Particle to."], 'emphatic': ["Усилительная: even, only.", "Emphatic."],
  'quantifier': ["Квантор: some, many, few.", "Quantifier."], 'distributive': ["Распределительный: each, every.", "Distributive."]
});

D('f:', {
  'Present': ["Настоящее время.", "Present tense."], 'Past': ["Прошедшее время.", "Past tense."], 'Future': ["Будущее время (will + V).", "Future tense (will + V)."],
  'Simple': ["Простой вид: регулярное действие.", "Simple aspect."], 'Continuous': ["Длительный вид: процесс (be + V-ing).", "Continuous aspect."],
  'Perfect': ["Совершённый вид: результат (have + V3).", "Perfect aspect."], 'Perfect Continuous': ["Совершённо-длительный вид.", "Perfect Continuous."],
  'Active': ["Действительный залог.", "Active voice."], 'Passive': ["Страдательный залог (be + V3).", "Passive voice."],
  'Indicative': ["Изъявительное наклонение.", "Indicative mood."], 'Imperative': ["Повелительное наклонение.", "Imperative mood."],
  'Subjunctive': ["Сослагательное наклонение.", "Subjunctive mood."], 'Conditional': ["Условное наклонение (would + V).", "Conditional mood."]
});

D('s:', {
  'Simple': ["Простое предложение.", "Simple sentence."], 'Compound': ["Сложносочинённое.", "Compound sentence."],
  'Complex': ["Сложноподчинённое.", "Complex sentence."], 'Compound-complex': ["Смешанное предложение.", "Compound-complex."],
  'Declarative': ["Повествовательное.", "Declarative."], 'Interrogative': ["Вопросительное.", "Interrogative."],
  'Imperative': ["Побудительное.", "Imperative."], 'Exclamatory': ["Восклицательное.", "Exclamatory."],
  'General': ["Общий вопрос (yes/no).", "General question."], 'Special': ["Специальный вопрос (Wh-).", "Special question."],
  'Alternative': ["Альтернативный вопрос (or).", "Alternative question."], 'Disjunctive': ["Разделительный вопрос (tag).", "Disjunctive question."],
  'Affirmative': ["Утвердительное.", "Affirmative."], 'Negative': ["Отрицательное.", "Negative."]
});

D('t:', {
  'c': ["Придаточные и словосочетания: рамка над группой слов.", "Clauses and phrases: bracket above words."],
  'm': ["Члены предложения: подчёркивание под словом.", "Sentence parts: underline below words."],
  'pos': ["Часть речи одного слова и её уточнения.", "Part of speech and sub-types."],
  'f': ["Время, вид, залог и наклонение сказуемого.", "Tense, aspect, voice and mood."],
  's': ["Тип всего предложения.", "Type of the whole sentence."],
  'ai': ["Проверка разбора нейросетью.", "Check your parse with an AI model."]
});

D('u:', {
  'auto': ["Автоматически расставить выбранные параметры со 100% уверенностью.", "Auto-tag selected parameters with 100% confidence."],
  'auto_cfg': ["Настроить параметры авторасстановки (100% уверенность).", "Configure 100% auto-tag parameters."],
  'clr': ["Убрать метки с выделенных слов.", "Remove marks from selected words."],
  'all': ["Стереть всю разметку.", "Clear every mark."],
  'aichk': ["Отправить разбор на проверку нейросети.", "Send parse to AI model."],
  'multi': ["Клик добавляет слово к выделению.", "A click adds a word to selection."],
  'restr': ["Метки можно ставить только на подходящие части речи.", "Labels only apply to suitable parts of speech."],
  'sc': ["Масштаб картинки при экспорте.", "Image export scale."],
  'rp': ["Заменить текст картинкой при вставке.", "Replace original text with image."],
  'ins': ["Скопировать изображение в буфер обмена для Google Docs (Ctrl+Enter).", "Copy image to clipboard for Google Docs (Ctrl+Enter)."],
  'ta': ["Текст предложения для разбора.", "The sentence to parse."],
  'view': ["Переключить вид: 2 колонки / 1 колонка / вкладки.", "Switch view: 2 columns / 1 column / tabs."],
  'lang': ["Язык подсказок (RU / EN).", "Language of tooltips (RU / EN)."],
  'tr': ["Перевести текст предложения.", "Translate the sentence."],
  'copy': ["Скопировать разбор как картинку в буфер обмена (Ctrl+V).", "Copy parse to clipboard as image (Ctrl+V)."],
  'hint': ["Клик — выбрать · drag/Shift+клик — диапазон · Ctrl+клик — добавить · ← → навигация", "Click word · drag/Shift+click = range · Ctrl+click = add · ← → navigate"],
  'dl': ["Сохранить картинку PNG.", "Save image as PNG."],
  'cls': ["Закрыть окно.", "Close window."],
  'aik': ["API-ключ PositionAPI / OpenAI (sk-…).", "API key (sk-…)."],
  'aim': ["Модель для проверки.", "Model for checking."],
  'ail': ["Язык пояснений нейросети.", "Language of AI explanations."],
  'save': ["Сохранить настройки.", "Save settings."],
  'models': ["Загрузить список моделей.", "Load models."],
  'rm': ["Удалить ключ.", "Remove key."],
  'run': ["Проверить текущий разбор.", "Check current parse."]
});

const tip = k => { const t = T[k]; return t ? t[TL === 'ru' ? 0 : 1] : ''; };
const ttl = (k, reason) => { const t = [tip(k), reason ? reason : ''].filter(Boolean).join('\n'); return t ? ` title="${esc(t)}"` : ''; };

function exact(k) { const s = ss(); return s.length ? an.find(a => a.k === k && same(sorted(a), s)) : null; }

function sanitizeSentenceParts() {
  const seenM = new Set();
  const cleaned = [];
  for (let i = an.length - 1; i >= 0; i--) {
    const a = an[i];
    if (a.k === 'm') {
      a.ix = a.ix.filter(idx => !seenM.has(idx));
      if (!a.ix.length) continue;
      a.ix.forEach(idx => seenM.add(idx));
    }
    cleaned.unshift(a);
  }
  an = cleaned;
}

/* ---------- parsing ---------- */
function parse() {
  const old = toks, re = /(\s*)([\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*|[^\s])/gu, rawOut = [];
  let m;
  while ((m = re.exec(ta.value))) {
    rawOut.push({ t: m[2], word: /[\p{L}\p{N}]/u.test(m[2]), sp: m[1].length > 0, br: m[1].includes('\n') });
  }

  // Detect sentence number prefixes (e.g. "1.", "2)") and sentence boundaries
  let currentSentence = 1;
  let atSentenceStart = true;
  for (let i = 0; i < rawOut.length; i++) {
    const k = rawOut[i];
    if (atSentenceStart) {
      if (/^\d+$/.test(k.t) && rawOut[i + 1] && /^[.)]$/.test(rawOut[i + 1].t)) {
        currentSentence = parseInt(k.t, 10) || currentSentence;
        k.isSentNumPrefix = true;
        rawOut[i + 1].isSentNumPrefix = true;
        i++; // skip dot
        continue;
      }
      k.sentIndex = currentSentence;
      k.isSentStart = true;
      if (currentSentence > 1) k.br = true;
      atSentenceStart = false;
    } else {
      k.sentIndex = currentSentence;
    }
    if (k.br || (k.t === '.' || k.t === '!' || k.t === '?')) {
      currentSentence++;
      atSentenceStart = true;
    }
  }

  const out = rawOut.filter(k => !k.isSentNumPrefix);
  out.forEach((k, i) => { const o = old[i]; if (o && o.t === k.t) { k.p = o.p; k.s = o.s; } });
  an.forEach(a => a.ix = a.ix.filter(i => old[i] && out[i] && old[i].t === out[i].t));
  an = an.filter(a => a.ix.length);
  sanitizeSentenceParts();
  toks = out;
  sel = sel.filter(i => i < toks.length && toks[i].word);
  if (typeof updateProgressBar === 'function') updateProgressBar();
  window.__fomaCurrentText = ta.value;
  try {
    window.parent?.postMessage({ action: 'foma_parser_text_sync', text: ta.value }, '*');
  } catch (_) {}
}

function ensureToksSpacing(tokenList, refToks = toks) {
  if (!Array.isArray(tokenList)) return [];
  return tokenList.map((k, i) => {
    let sp = k.sp;
    let br = k.br;
    if (sp === undefined) {
      if (refToks && refToks[i] && refToks[i].t === k.t) {
        sp = !!refToks[i].sp;
        br = !!refToks[i].br;
      } else {
        sp = i === 0 ? false : (k.word || !/^[.,!?;:)\]}']/.test(k.t));
        br = false;
      }
    }
    return { ...k, sp: !!sp, br: !!br };
  });
}

/* ---------- layout ---------- */
function lw(ctx, k, showSubs = true) {
  if (!k.p) return 0;
  ctx.font = FL;
  const pLabel = PO[k.p] ? PO[k.p][1] : String(k.p);
  const pw = ctx.measureText(pLabel).width;
  ctx.font = FS_;
  let sw = 0;
  if (showSubs && k.s && k.s.length) {
    const lines = getSmartSubLines(ctx, k, 75);
    for (const line of lines) {
      const lineW = ctx.measureText(line).width;
      if (lineW > sw) sw = lineW;
    }
  }
  const w = Math.max(pw, sw);
  return Math.min(w + 6, 92);
}

function segs(a) {
  const ix = sorted(a), out = [];
  let c = null;
  const gap = (p, q) => { for (let j = p + 1; j < q; j++) if (toks[j].word) return true; return false; };
  for (const i of ix) {
    const k = toks[i];
    if (c && k.line === c.line && !gap(c.e, i)) c.e = i;
    else { c = { s: i, e: i, line: k.line }; out.push(c); }
  }
  return out;
}

function levels(list) {
  const done = [];
  const isAbove = list.length && list.some(a => a.k === 'c');

  if (isAbove) {
    // For brackets above (clauses and phrases): continuous bracket span from min to max
    for (const a of [...list].sort((p, q) => (Math.max(...p.ix) - Math.min(...p.ix)) - (Math.max(...q.ix) - Math.min(...q.ix)))) {
      const lo = Math.min(...a.ix), hi = Math.max(...a.ix);
      let l = 0;
      while (done.some(b => b.l === l && b.lo <= hi && b.hi >= lo)) l++;
      a.l = l; a.lo = lo; a.hi = hi; done.push(a);
    }
  } else {
    // For underlines below (sentence parts 'm' and verb forms 'f'):
    // Prioritize sentence parts 'm' on level 0, verb forms 'f' below them
    const sortedList = [...list].sort((p, q) => {
      if (p.k !== q.k) return p.k === 'm' ? -1 : 1;
      return p.ix.length - q.ix.length;
    });

    for (const a of sortedList) {
      if (!a.ix || !a.ix.length) continue;
      const aSet = new Set(a.ix);
      let l = 0;
      // An annotation only collides on level l if sharing at least one exact word token
      while (done.some(b => b.l === l && b.ix && b.ix.some(i => aSet.has(i)))) {
        l++;
      }
      a.l = l;
      done.push(a);
    }
  }
}

function layout(ctx, W, preserveLines = false) {
  ensureLayerItems(aiLayers);
  const showPos = aiLayers?.pos !== false;
  const showParts = aiLayers?.parts !== false;
  const showClauses = aiLayers?.clauses !== false;
  const showTenses = aiLayers?.tenses !== false;
  const showST = aiLayers?.st !== false;

  const posItems = aiLayers?.pos_items || DEFAULT_POS_ITEMS;
  const partsItems = aiLayers?.parts_items || DEFAULT_PARTS_ITEMS;
  const clausesItems = aiLayers?.clauses_items || DEFAULT_CLAUSES_ITEMS;
  const tensesItems = aiLayers?.tenses_items || DEFAULT_TENSES_ITEMS;
  const stItems = aiLayers?.st_items || DEFAULT_ST_ITEMS;

  const showSubs = posItems.subs !== false;
  const isPosVisible = (p) => {
    if (!p) return false;
    return posItems[p] !== false;
  };

  ctx.font = F;
  const sp = ctx.measureText(' ').width;
  const GUTTER = 52;
  const maxLineW = Math.min(W - GUTTER - 16, 880);
  let x = GUTTER, line = 0, fresh = true;

  for (const k of toks) {
    ctx.font = F;
    const tw = ctx.measureText(k.t).width;
    const posVisible = showPos && isPosVisible(k.p);
    const bw = Math.max(tw, posVisible ? lw(ctx, k, showSubs) : 0);
    const shouldWrap = preserveLines && k._sourceLine !== undefined
      ? (k._sourceLine > line)
      : ((k.br && !fresh) || (k.sp && x + sp + bw > GUTTER + maxLineW));
    if (!fresh && shouldWrap) { line++; x = GUTTER; fresh = true; }
    if (!fresh && k.sp) x += sp;
    k.x = x; k.w = bw; k.tx = x + (bw - tw) / 2; k.line = line; x += bw; fresh = false;
    if (!preserveLines) {
      k._sourceLine = line;
    }
  }

  const n = line + 1;
  above = showClauses
    ? an.filter(a => a.k === 'c' && clausesItems[a.v] !== false)
    : [];

  below = [];
  for (const a of an) {
    if (a.k === 'm') {
      if (showParts && partsItems[a.v] !== false) {
        below.push(a);
      }
    } else if (a.k === 'f') {
      if (showTenses) {
        const filteredV = getFilteredVerbFormLabel(a, tensesItems);
        if (filteredV) {
          below.push({ ...a, v: filteredV });
        }
      }
    }
  }

  levels(above);
  levels(below);

  const cn = Array(n).fill(0), mb = Array(n).fill(0), ph = Array(n).fill(0);
  above.forEach(a => segs(a).forEach(s => cn[s.line] = Math.max(cn[s.line], a.l + 1)));
  below.forEach(a => segs(a).forEach(s => mb[s.line] = Math.max(mb[s.line], a.l + 1)));
  if (showPos) {
    toks.forEach(k => {
      if (k.p && isPosVisible(k.p)) {
        const subLines = (showSubs && k.s && k.s.length) ? getSmartSubLines(ctx, k, Math.max(k.w + 14, 52)) : [];
        const reqH = subLines.length > 1 ? (34 + (subLines.length - 1) * 14) : (subLines.length === 1 ? 34 : 18);
        ph[k.line] = Math.max(ph[k.line], reqH);
      }
    });
  }

  const filteredST = (showST && ST && Array.isArray(ST))
    ? ST.filter(item => Boolean(item) && stItems[item] !== false)
    : [];
  const lab = (showST && filteredST.length) ? 'Sentence: ' + filteredST.join(' · ') : '';

  let y = TOP + (lab ? 24 : 0);
  Ls = [];
  for (let l = 0; l < n; l++) {
    const L = { y, cn: cn[l], ca: cn[l] * CR, p: ph[l], mb: mb[l] };
    L.b = y + L.ca + L.p + 34;
    Ls.push(L);
    y = L.b + (mb[l] ? 12 + mb[l] * MR + 8 : 14);
  }
  return y + TOP;
}

/* ---------- painting ---------- */
function ul(ctx, s, a, b, y, isDark = false, customColor = null, customWidth = 1.5) {
  ctx.strokeStyle = customColor || (isDark ? '#e4e4e7' : '#111');
  ctx.lineWidth = customWidth || 1.5;
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);
  ctx.beginPath();
  const dbl = s === 'double' || s === 'ddash';

  if (s === 'wavy') {
    for (let x = a; x <= b; x++) {
      const yy = y + 2 * Math.sin((x - a) * Math.PI / 4);
      x === a ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
  } else {
    if (s === 'dashed' || s === 'ddash') ctx.setLineDash([6, 4]);
    else if (s === 'dotted') { ctx.setLineDash([1.5, 3.5]); ctx.lineCap = 'round'; }
    else if (s === 'dashdot') ctx.setLineDash([10, 4, 2, 4]);

    if (dbl) {
      ctx.moveTo(a, y - 2.5); ctx.lineTo(b, y - 2.5);
      ctx.moveTo(a, y + 2.5); ctx.lineTo(b, y + 2.5);
    } else {
      ctx.moveTo(a, y); ctx.lineTo(b, y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
}

function renderSmartAbove(ctx, aboveList, getSegs, getTok, getLine, hitsCollector = null, isDark = false, isBw = false) {
  const items = [];
  for (const a of aboveList) {
    for (const s of getSegs(a)) {
      const t1 = getTok(s.s), t2 = getTok(s.e), L = getLine(s.line);
      if (!t1 || !t2 || !L) continue;
      const x1 = t1.x, x2 = t2.x + t2.w, rt = L.y + (L.cn - 1 - a.l) * CR;
      items.push({ a, s, line: s.line, level: a.l, x1, x2, cx: (x1 + x2) / 2, rt });
    }
  }

  const groups = {};
  for (const item of items) {
    const key = item.line + '_' + item.level;
    (groups[key] = groups[key] || []).push(item);
  }

  const safeLabels = new Map();
  ctx.save();
  ctx.font = FL;
  for (const key in groups) {
    const group = groups[key].sort((p, q) => p.cx - q.cx);
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const prev = group[i - 1];
      const next = group[i + 1];

      const leftMargin = prev ? (item.cx - prev.cx) / 2 - 3 : Infinity;
      const rightMargin = next ? (next.cx - item.cx) / 2 - 3 : Infinity;
      const maxHalf = Math.min(leftMargin, rightMargin);
      const spanW = item.x2 - item.x1;
      const maxW = Math.max(spanW - 2, maxHalf * 2);

      safeLabels.set(item, getSmartLabel(ctx, item.a.v, item.a.k, maxW));
    }
  }
  ctx.restore();

  const isColor = renderMode === 'color_focus' && !isBw;

  for (const item of items) {
    const { a, x1, x2, cx, rt } = item;
    const clauseColor = isColor ? getClauseColor(a.v, isDark) : (isDark ? '#71717a' : '#888');
    ctx.strokeStyle = clauseColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1 + 1, rt + 20);
    ctx.lineTo(x1 + 1, rt + 15);
    ctx.lineTo(x2 - 1, rt + 15);
    ctx.lineTo(x2 - 1, rt + 20);
    ctx.stroke();

    ctx.font = FL;
    ctx.fillStyle = isColor ? clauseColor : (isDark ? '#d4d4d8' : '#333');
    const labelText = safeLabels.get(item) || a.v;
    ctx.fillText(labelText, cx, rt + 11);
    if (hitsCollector) hitsCollector.push({ a, x1, x2, y1: rt, y2: rt + CR });
  }
}

function renderSmartBelow(ctx, belowList, getSegs, getTok, getLine, hitsCollector = null, isDark = false, isBw = false) {
  const items = [];
  for (const a of belowList) {
    for (const s of getSegs(a)) {
      const t1 = getTok(s.s), t2 = getTok(s.e), L = getLine(s.line);
      if (!t1 || !t2 || !L) continue;
      const x1 = t1.x, x2 = t2.x + t2.w, rt = L.b + 12 + a.l * MR;
      items.push({ a, s, line: s.line, level: a.l, x1, x2, cx: (x1 + x2) / 2, rt });
    }
  }

  const groups = {};
  for (const item of items) {
    const key = item.line + '_' + item.level;
    (groups[key] = groups[key] || []).push(item);
  }

  const safeLabels = new Map();
  ctx.save();
  for (const key in groups) {
    const group = groups[key].sort((p, q) => p.cx - q.cx);
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const prev = group[i - 1];
      const next = group[i + 1];

      const leftMargin = prev ? (item.cx - prev.cx) / 2 - 3 : Infinity;
      const rightMargin = next ? (next.cx - item.cx) / 2 - 3 : Infinity;
      const maxHalf = Math.min(leftMargin, rightMargin);
      const spanW = item.x2 - item.x1;
      const maxW = Math.max(spanW - 2, maxHalf * 2);

      ctx.font = (item.a.k === 'm' || item.a.k === 'f') ? FS_ : FB;
      safeLabels.set(item, getSmartLabel(ctx, item.a.v, item.a.k, maxW));
    }
  }
  ctx.restore();

  const isColor = renderMode === 'color_focus' && !isBw;

  for (const item of items) {
    const { a, x1, x2, cx, rt } = item;
    if (a.k === 'm') {
      const partsColor = isColor ? getPartColor(a.v, isDark) : null;
      if (partsFormat === 'symbols_only') {
        ul(ctx, MS[a.v] || 'solid', x1 + 1, x2 - 1, rt + 5, isDark, partsColor, 1.5);
      } else if (partsFormat === 'short') {
        ul(ctx, 'solid', x1 + 1, x2 - 1, rt + 4, isDark, partsColor, 1.2);
        ctx.font = FS_;
        ctx.fillStyle = isColor ? partsColor : (isDark ? '#a1a1aa' : '#666');
        const shortText = (M_ABBR[a.v] && M_ABBR[a.v][1]) ? M_ABBR[a.v][1] : (safeLabels.get(item) || a.v);
        ctx.fillText(shortText, cx, rt + 18);
      } else if (partsFormat === 'full') {
        ul(ctx, 'solid', x1 + 1, x2 - 1, rt + 4, isDark, partsColor, 1.2);
        ctx.font = FS_;
        ctx.fillStyle = isColor ? partsColor : (isDark ? '#a1a1aa' : '#666');
        ctx.fillText(a.v, cx, rt + 18);
      } else {
        // 'combo' (Default): school underline + short name
        ul(ctx, MS[a.v] || 'solid', x1 + 1, x2 - 1, rt + 5, isDark, partsColor, 1.5);
        ctx.font = FS_;
        ctx.fillStyle = isColor ? partsColor : (isDark ? '#a1a1aa' : '#666');
        const labelText = safeLabels.get(item) || a.v;
        ctx.fillText(labelText, cx, rt + 19);
      }
    } else if (a.k === 'f') {
      const tensesColor = isColor ? (isDark ? '#fbbf24' : '#b45309') : (isDark ? '#a5b4fc' : '#4338ca');
      ctx.font = FS_;
      ctx.fillStyle = tensesColor;
      const labelText = safeLabels.get(item) || a.v;
      ctx.fillText(labelText, cx, rt + 18);
    } else {
      ctx.font = FB;
      ctx.fillStyle = isDark ? '#e4e4e7' : '#222';
      const labelText = safeLabels.get(item) || a.v;
      ctx.fillText(labelText, cx, rt + 19);
    }
    if (hitsCollector) hitsCollector.push({ a, x1, x2, y1: rt, y2: rt + MR });
  }
}

const CANVAS_PALETTE = {
  light: {
    background: '#fff',
    emptyPromptText: '#9aa0b0',
    gutterText: '#9ca3af',
    sentenceTypeLabel: '#444',
    selectionFill: 'rgba(224, 231, 255, 0.85)',
    selectionStroke: 'rgba(59, 130, 246, 0.4)',
    tokenText: '#111',
    posBwText: '#444',
    posBwSubtext: '#777'
  },
  dark: {
    background: '#141416',
    emptyPromptText: '#71717a',
    gutterText: '#71717a',
    sentenceTypeLabel: '#d4d4d8',
    selectionFill: 'rgba(30, 41, 59, 0.9)',
    selectionStroke: 'rgba(96, 165, 250, 0.45)',
    tokenText: '#f4f4f5',
    posBwText: '#a1a1aa',
    posBwSubtext: '#71717a'
  }
};

function paint(ctx, W, H, exp, expBw = false) {
  const isDark = !exp && currentTheme === 'dark';
  const isBw = expBw || (renderMode === 'bw');
  const palette = CANVAS_PALETTE[isDark ? 'dark' : 'light'];
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, W, H);
  hits = [];

  const GUTTER = 52;
  if (!toks.length && !exp) {
    ctx.fillStyle = palette.emptyPromptText;
    ctx.font = FL;
    ctx.textAlign = 'left';
    ctx.fillText('Type or paste a sentence below under “Edit sentence text”.', GUTTER, TOP + 40);
  }

  // Draw Gutter Sentence Numbers (Left Field)
  ctx.save();
  ctx.font = '600 13.5px "Inter", -apple-system, sans-serif';
  ctx.fillStyle = palette.gutterText;
  ctx.textAlign = 'right';
  const drawnSentences = new Set();
  toks.forEach(k => {
    if (k.isSentStart && k.sentIndex && !drawnSentences.has(k.sentIndex)) {
      drawnSentences.add(k.sentIndex);
      const L = Ls[k.line];
      if (L) {
        ctx.fillText(String(k.sentIndex), 34, L.b);
      }
    }
  });
  ctx.restore();

  const showPos = aiLayers?.pos !== false;
  const showParts = aiLayers?.parts !== false;
  const showClauses = aiLayers?.clauses !== false;
  const showTenses = aiLayers?.tenses !== false;
  const showST = aiLayers?.st !== false;

  const posItems = aiLayers?.pos_items || DEFAULT_POS_ITEMS;
  const stItems = aiLayers?.st_items || DEFAULT_ST_ITEMS;
  const showSubs = posItems.subs !== false;
  const isPosVisible = (p) => {
    if (!p) return false;
    return posItems[p] !== false;
  };

  const filteredST = (showST && ST && Array.isArray(ST))
    ? ST.filter(item => Boolean(item) && stItems[item] !== false)
    : [];
  const lab = (showST && filteredST.length) ? 'Sentence: ' + filteredST.join(' · ') : '';

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  if (lab) {
    ctx.font = FB;
    ctx.fillStyle = palette.sentenceTypeLabel;
    ctx.fillText(lab, GUTTER, TOP + 14);
  }

  // Selection highlight with calm neutral rounded box
  if (!exp && sel.length > 0) {
    ctx.save();
    for (const i of sel) {
      const k = toks[i], L = Ls[k.line];
      if (!k || !L) continue;
      const rx = k.x - 3, ry = L.y + L.ca, rw = k.w + 6, rh = L.p + 44;
      ctx.fillStyle = palette.selectionFill;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, 4);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();
      ctx.strokeStyle = palette.selectionStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Tokens text
  ctx.font = F;
  ctx.fillStyle = palette.tokenText;
  for (const k of toks) ctx.fillText(k.t, k.tx, Ls[k.line].b);

  // POS Rendering
  if (showPos) {
    ctx.textAlign = 'center';
    for (const k of toks) {
      if (k.p && isPosVisible(k.p)) {
        const L = Ls[k.line], cx = k.x + k.w / 2, s = showSubs ? subs(k) : null, t = L.y + L.ca;
        const posColor = !isBw ? getPosColor(k.p, isDark) : palette.posBwText;
        ctx.font = FL;
        ctx.fillStyle = posColor;
        const pLabel = PO[k.p] ? PO[k.p][1] : String(k.p);
        ctx.fillText(pLabel, cx, t + (s ? 13 : 14));
        if (s) {
          ctx.font = FS_;
          ctx.fillStyle = !isBw ? posColor : palette.posBwSubtext;
          const subLines = getSmartSubLines(ctx, k, Math.max(k.w + 14, 52));
          for (let li = 0; li < subLines.length; li++) {
            ctx.fillText(subLines[li], cx, t + 27 + li * 13);
          }
        }
      }
    }
  }

  if (showClauses) {
    renderSmartAbove(ctx, above, segs, i => toks[i], l => Ls[l], hits, isDark, isBw);
  }
  if (showParts || showTenses) {
    renderSmartBelow(ctx, below, segs, i => toks[i], l => Ls[l], hits, isDark, isBw);
  }
}

const wExp = sc => Math.round(600 / (sc / 100));
let lastRenderAvailableW = 800;

function render() {
  sanitizeSentenceParts();
  const ctx = cv.getContext('2d');
  const availableW = Math.max(300, (wrap && wrap.clientWidth) ? wrap.clientWidth : 800);
  lastRenderAvailableW = availableW;
  const H = Math.max(layout(ctx, availableW), 70);
  const W = availableW;
  const d = window.devicePixelRatio || 1;

  cv.width = W * d;
  cv.height = H * d;
  cv.style.width = W + 'px';
  cv.style.maxWidth = '100%';
  cv.style.height = H + 'px';
  if (ta?.value) {
    const rawVal = ta.value.trim();
    if (rawVal) {
      cv.setAttribute('aria-label', `Синтаксическая схема: "${rawVal}"`);
    }
  }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  paint(ctx, W, H, false);
}

/* ---------- panes ---------- */
const sw = s => {
  const w = 40, y = 8;
  let d = s === 'wavy' ? Array.from({ length: w + 1 }, (_, x) => (x ? 'L' : 'M') + x + ' ' + (y + 2 * Math.sin(x * Math.PI / 4)).toFixed(1)).join('') : (s === 'double' || s === 'ddash') ? `M0 ${y - 2.5}H${w}M0 ${y + 2.5}H${w}` : `M0 ${y}H${w}`;
  const da = (s === 'dashed' || s === 'ddash') ? ' stroke-dasharray="6 4"' : s === 'dashdot' ? ' stroke-dasharray="10 4 2 4"' : s === 'dotted' ? ' stroke-dasharray="1.5 3.5" stroke-linecap="round"' : '';
  return `<svg width="${w}" height="16" viewBox="0 0 ${w} 16"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5"${da}/></svg>`;
};

const tkey = (a, v) => ({ m: 'm:', c: 'c:', p: 'p:', ps: 'ps:', t: 't:' }[a] || '') + (a === 'f' || a === 's' ? a + ':' + String(v).split('|')[1] : v);
const btn = (a, v, t, on, c = '') => {
  const o = c.includes('off');
  return `<button class="${c} ${on ? 'on' : ''}" data-${a}="${v}"${o ? ' disabled' : ''}${ttl(tkey(a, v), o ? why(a, a === 'f' ? '' : v) : '')}>${t}</button>`;
};

// ── Allowed parts of speech for each sentence part ──
const ALL_POS_KEYS = ['n', 'pron', 'adj', 'num', 'v', 'adv', 'art', 'prep', 'conj', 'part', 'int', 'det'];
const ADVM_POS = ['adv', 'prep', 'n', 'pron', 'det', 'adj', 'num', 'art', 'v', 'conj', 'part'];

const SP_POS = {
  'Subject': ['n', 'pron', 'num', 'v', 'adj', 'det', 'art'],
  'Predicate': ['v', 'part'],
  'Predicative': ['n', 'pron', 'adj', 'num', 'adv', 'prep', 'v', 'det', 'art'],
  'Direct object': ['n', 'pron', 'num', 'v', 'adj', 'det', 'art', 'prep'],
  'Indirect object': ['n', 'pron', 'num', 'det', 'art'],
  'Prepositional object': ['prep', 'n', 'pron', 'num', 'v', 'adj', 'det', 'art'],
  'Attribute': ['adj', 'n', 'pron', 'num', 'v', 'det', 'adv', 'prep', 'art'],
  'Apposition': ['n', 'pron', 'num', 'det', 'art'],
  'AdvM manner': ADVM_POS,
  'AdvM place': ADVM_POS,
  'AdvM time': ADVM_POS,
  'AdvM frequency': ADVM_POS,
  'AdvM degree': ADVM_POS,
  'AdvM cause': ADVM_POS,
  'AdvM purpose': ADVM_POS,
  'AdvM condition': ADVM_POS,
  'AdvM concession': ADVM_POS,
  'Introductory element': ALL_POS_KEYS,
  'Address': ['n', 'pron', 'adj', 'det']
};

const getSpPos = m => {
  if (SP_POS[m]) return SP_POS[m];
  if (typeof m === 'string' && m.startsWith('AdvM')) return ADVM_POS;
  return ALL_POS_KEYS;
};

const RU_M_NAME = {
  'Subject': 'Подлежащее',
  'Predicate': 'Сказуемое',
  'Predicative': 'Предикатив',
  'Direct object': 'Прямое дополнение',
  'Indirect object': 'Косвенное дополнение',
  'Prepositional object': 'Предложное дополнение',
  'Attribute': 'Определение',
  'Apposition': 'Приложение',
  'AdvM manner': 'Обстоятельство образа действия',
  'AdvM place': 'Обстоятельство места',
  'AdvM time': 'Обстоятельство времени',
  'AdvM frequency': 'Обстоятельство частоты',
  'AdvM degree': 'Обстоятельство степени',
  'AdvM cause': 'Обстоятельство причины',
  'AdvM purpose': 'Обстоятельство цели',
  'AdvM condition': 'Обстоятельство условия',
  'AdvM concession': 'Обстоятельство уступки',
  'Introductory element': 'Вводный элемент',
  'Address': 'Обращение'
};

const RU_P_INSTR = {
  'n': 'существительным',
  'pron': 'местоимением',
  'adj': 'прилагательным',
  'num': 'числительным',
  'v': 'глаголом',
  'adv': 'наречием',
  'art': 'артиклем',
  'prep': 'предлогом',
  'conj': 'союзом',
  'part': 'частицей',
  'int': 'междометием',
  'det': 'детерминативом'
};

const RU_P_NOM = {
  'n': 'Существительное',
  'pron': 'Местоимение',
  'adj': 'Прилагательное',
  'num': 'Числительное',
  'v': 'Глагол',
  'adv': 'Наречие',
  'art': 'Артикль',
  'prep': 'Предлог',
  'conj': 'Союз',
  'part': 'Частица',
  'int': 'Междометие',
  'det': 'Детерминатив'
};

const RU_M_INSTR = {
  'Subject': 'подлежащим',
  'Predicate': 'сказуемым',
  'Predicative': 'предикативом',
  'Direct object': 'прямым дополнением',
  'Indirect object': 'косвенным дополнением',
  'Prepositional object': 'предложным дополнением',
  'Attribute': 'определением',
  'Apposition': 'приложением',
  'Introductory element': 'вводным элементом',
  'Address': 'обращением'
};
const getRuMInstr = m => RU_M_INSTR[m] || (typeof m === 'string' && m.startsWith('AdvM') ? 'обстоятельством' : m);
const getRuMNom = m => RU_M_NAME[m] || m;

const OBJ = ['Direct object', 'Indirect object', 'Prepositional object'], ATT = ['Attribute', 'Apposition'];
const CROLE = {
  'Subject clause': ['Subject'], 'Predicative clause': ['Predicative'], 'Object clause': OBJ,
  'Attributive clause (defining)': ATT, 'Attributive clause (non-defining)': ATT,
  'Complex subject': ['Subject'], 'Complex object': OBJ, 'AdvCl time': ['AdvM time'],
  'AdvCl place': ['AdvM place'], 'AdvCl cause': ['AdvM cause'], 'AdvCl purpose': ['AdvM purpose'],
  'AdvCl condition': ['AdvM condition'], 'AdvCl concession': ['AdvM concession'], 'AdvCl manner': ['AdvM manner'],
  'AdvCl result': ['AdvM degree', 'AdvM manner'], 'AdvCl comparison': ['AdvM manner', 'AdvM degree'],
  'Verb phrase': ['Predicate'], 'Infinitive phrase': ['Predicate', 'Subject', 'Direct object', 'Attribute', 'AdvM purpose'],
  'Gerund phrase': ['Subject', 'Direct object', 'Prepositional object', 'Predicative', 'Attribute'],
  'Participial phrase': ['Attribute', 'AdvM manner', 'AdvM time', 'AdvM cause'],
  'Noun phrase': ['Subject', 'Predicative', 'Direct object', 'Indirect object', 'Prepositional object', 'Apposition', 'Address'],
  'Prepositional phrase': ['Prepositional object', 'Attribute', 'AdvM place', 'AdvM time', 'AdvM manner', 'AdvM cause', 'AdvM purpose', 'AdvM condition', 'AdvM concession', 'Predicative']
};

const PRED_C = ['Verb phrase', 'Infinitive phrase', 'Gerund phrase', 'Participial phrase'], PRED_P = ['v', 'part'];
const predSel = s => s.length > 0 && (
  an.some(a => a.k === 'm' && a.v === 'Predicate' && s.some(i => a.ix.includes(i))) ||
  s.some(i => toks[i]?.p === 'v')
);

function posOk(k, v, s) {
  if (k === 'p') {
    // Single word POS check against its sentence part
    if (s.length === 1) {
      const curM = an.find(a => a.k === 'm' && a.ix.includes(s[0]))?.v;
      if (curM && !getSpPos(curM).includes(v)) return false;
    }
    return true;
  }
  if (k === 'm') {
    // Sentence part check against existing POS of the selected words
    const allowed = getSpPos(v);
    const ks = s.map(i => toks[i]).filter(Boolean);
    if (ks.length && ks.every(x => x.p) && !ks.some(x => allowed.includes(x.p))) {
      return false;
    }
    return true;
  }
  if (k === 'f') {
    // Tense/voice/mood: only applies to Predicate or Verb
    return s.length > 0 && predSel(s);
  }
  return true;
}

function roleOk(k, v, s) {
  if (k === 'c' && CROLE[v]) {
    const ms = an.filter(a => a.k === 'm' && same(sorted(a), s));
    return !ms.length || ms.some(a => CROLE[v].includes(a.v));
  }
  if (k === 'm') {
    const curC = an.find(a => a.k === 'c' && same(sorted(a), s))?.v;
    if (curC && CROLE[curC] && !CROLE[curC].includes(v)) {
      return false;
    }
  }
  return true;
}

function okSel(k, v, s) {
  if (!$('restr') || !$('restr').checked) return true;
  return posOk(k, v, s) && roleOk(k, v, s);
}

function why(k, v, s = ss()) {
  const ru = TL === 'ru';
  if (k === 'p') {
    if (s.length === 1) {
      const curM = an.find(a => a.k === 'm' && a.ix.includes(s[0]))?.v;
      if (curM && !getSpPos(curM).includes(v)) {
        return ru 
          ? `${getRuMNom(curM)} не может быть выражено ${RU_P_INSTR[v] || v}.` 
          : `“${curM}” cannot be a ${PO[v] ? PO[v][0].toLowerCase() : v}.`;
      }
    }
    return ru ? 'Не подходит для выбранного слова.' : 'Does not match the selected word.';
  }
  if (k === 'm') {
    if (s.length === 1 && toks[s[0]]?.p) {
      const p = toks[s[0]].p;
      if (!getSpPos(v).includes(p)) {
        return ru 
          ? `${RU_P_NOM[p] || p} не может быть ${getRuMInstr(v)}.` 
          : `A ${PO[p] ? PO[p][0].toLowerCase() : p} cannot be a ${v}.`;
      }
    }
    const curC = an.find(a => a.k === 'c' && same(sorted(a), s))?.v;
    if (curC && CROLE[curC] && !CROLE[curC].includes(v)) {
      return ru
        ? `Конструкция «${curC}» не подходит для роли ${getRuMInstr(v)}.`
        : `Construction “${curC}” fits only: ${CROLE[curC].join(', ')}.`;
    }
    return ru ? 'Не подходит для выбранных слов.' : 'Does not match the selection.';
  }
  if (k === 'f') {
    return ru 
      ? 'Время, вид, залог и наклонение применимы только к сказуемому (глаголу).' 
      : 'Tense, aspect, voice, and mood only apply to the Predicate (verb).';
  }
  if (k === 'c') {
    const curM = an.find(a => a.k === 'm' && same(sorted(a), s))?.v;
    if (curM && CROLE[v] && !CROLE[v].includes(curM)) {
      return ru 
        ? `«${v}» подходит только для: ${CROLE[v].map(getRuMNom).join(', ')}.` 
        : `“${v}” fits only: ${CROLE[v].join(', ')}.`;
    }
    return ru 
      ? `Подходит только для: ${(CROLE[v] || []).map(getRuMNom).join(', ')}.` 
      : `Fits only: ${(CROLE[v] || []).join(', ')}.`;
  }
  return ru ? 'Недоступно для текущего выделения.' : 'Unavailable for current selection.';
}

const DOT = ['#6d9fe0', '#5fbb86', '#e3a95a', '#a487d4', '#52b3b3'];
const TABS = [
  ['m', 'Sentence parts'],
  ['pos', 'Part of speech'],
  ['c', 'Clauses & phrases'],
  ['f', 'Tense · voice · mood'],
  ['s', 'Sentence type']
];
const CI = { pos: 0, m: 1, c: 2, f: 3, s: 4 };

/* ─── Inner Docking System (Reorder / Move Group Panels Inside Parent) ─── */
const DEFAULT_INNER_DOCK_LAYOUT = {
  m: {
    columns: [
      ['Core', 'Other'],
      ['Objects', 'Attributes'],
      ['Adverbial modifiers']
    ]
  },
  c: {
    columns: [
      ['Clauses'],
      ['Adverbial clauses'],
      ['Phrases & constructions']
    ]
  },
  s: {
    columns: [
      ['Structure'],
      ['Purpose'],
      ['Question type', 'Polarity']
    ]
  },
  f: {
    columns: [
      ['Tense'],
      ['Aspect'],
      ['Voice', 'Mood']
    ]
  }
};

let innerDockLayout = JSON.parse(JSON.stringify(DEFAULT_INNER_DOCK_LAYOUT));

function getCleanInnerLayout(tab, allGroups = []) {
  if (!innerDockLayout[tab] || !Array.isArray(innerDockLayout[tab].columns)) {
    innerDockLayout[tab] = JSON.parse(JSON.stringify(DEFAULT_INNER_DOCK_LAYOUT[tab] || { columns: [[], [], []] }));
  }
  const cur = innerDockLayout[tab];
  if (!cur.columns || !cur.columns.length) {
    cur.columns = [[], [], []];
  }
  while (cur.columns.length < 3) cur.columns.push([]);
  while (cur.columns.length > 3) {
    const extra = cur.columns.pop();
    if (Array.isArray(extra)) cur.columns[2].push(...extra);
  }

  // Self-healing: if an old/corrupted layout dumped all groups into column 0 and cols 1 & 2 are empty,
  // and the user hasn't explicitly customized it, restore default 3-column layout
  if (!cur._userCustomized && cur.columns[1].length === 0 && cur.columns[2].length === 0 && cur.columns[0].length >= 3 && DEFAULT_INNER_DOCK_LAYOUT[tab]) {
    innerDockLayout[tab] = JSON.parse(JSON.stringify(DEFAULT_INNER_DOCK_LAYOUT[tab]));
    return innerDockLayout[tab];
  }

  if (!allGroups.length) return cur;

  const seen = new Set();
  cur.columns = cur.columns.map(col => {
    return (col || []).filter(g => {
      if (allGroups.includes(g) && !seen.has(g)) {
        seen.add(g);
        return true;
      }
      return false;
    });
  });

  allGroups.forEach(g => {
    if (!seen.has(g)) {
      let minCol = 0;
      for (let i = 1; i < cur.columns.length; i++) {
        if (cur.columns[i].length < cur.columns[minCol].length) minCol = i;
      }
      cur.columns[minCol].push(g);
      seen.add(g);
    }
  });

  return cur;
}

function renderInnerCard(tab, g, contentHtml) {
  const gSlug = g.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `
    <div class="gb gb-${gSlug} inner-dock-card" data-inner-tab="${tab}" data-inner-grp="${esc(g)}">
      <div class="grp inner-card-header" draggable="true" data-inner-tab="${tab}" data-inner-grp="${esc(g)}" title="${L('Потяните за заголовок, чтобы переставить блок внутри панели', 'Drag header to reposition card')}">
        <span class="dock-drag-handle" title="${L('Потяните для перемещения блока', 'Drag to reposition')}">⋮⋮</span>
        <span class="inner-grp-title">${getGroupTitle(g)}</span>
        <div class="inner-card-tools">
          <button type="button" class="btn-inner-tool" data-inner-act="left" data-inner-tab="${tab}" data-inner-grp="${esc(g)}" title="${L('Сдвинуть в колонку слева', 'Move to left column')}">⇇</button>
          <button type="button" class="btn-inner-tool" data-inner-act="up" data-inner-tab="${tab}" data-inner-grp="${esc(g)}" title="${L('Поднять выше', 'Move up')}">↑</button>
          <button type="button" class="btn-inner-tool" data-inner-act="down" data-inner-tab="${tab}" data-inner-grp="${esc(g)}" title="${L('Опустить ниже', 'Move down')}">↓</button>
          <button type="button" class="btn-inner-tool" data-inner-act="right" data-inner-tab="${tab}" data-inner-grp="${esc(g)}" title="${L('Сдвинуть в колонку справа', 'Move to right column')}">⇉</button>
        </div>
      </div>
      ${contentHtml}
    </div>
  `;
}

function renderInnerDock(tab, cardsMap) {
  const allGroups = Object.keys(cardsMap);
  const layout = getCleanInnerLayout(tab, allGroups);
  let html = `<div class="inner-dock-container" data-inner-tab="${tab}">`;
  html += `<div class="inner-dock-cols">`;

  layout.columns.forEach((colGrps, colIdx) => {
    const isEmpty = !colGrps.length;
    html += `<div class="inner-dock-col inner-col-${colIdx} ${isEmpty ? 'is-empty-col' : ''}" data-inner-tab="${tab}" data-inner-col="${colIdx}">`;
    html += `<div class="inner-drop-zone" data-inner-tab="${tab}" data-target="col-${colIdx}-top"></div>`;
    colGrps.forEach(g => {
      if (cardsMap[g]) {
        html += renderInnerCard(tab, g, cardsMap[g]);
        html += `<div class="inner-drop-zone" data-inner-tab="${tab}" data-target="col-${colIdx}-after-${esc(g)}"></div>`;
      }
    });
    if (isEmpty) {
      html += `
        <div class="inner-empty-placeholder" data-inner-tab="${tab}" data-inner-col="${colIdx}">
          <div class="inner-empty-icon">+</div>
          <div class="inner-empty-title">${L(`Колонка ${colIdx + 1}`, `Column ${colIdx + 1}`)}</div>
          <div class="inner-empty-desc">${L('Перетащите блок сюда', 'Drop card here')}</div>
        </div>
      `;
    }
    html += `</div>`;
  });

  html += `</div></div>`;
  return html;
}

function saveInnerDockLayout() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ foma_inner_dock_layout: innerDockLayout });
  } else {
    try { localStorage.setItem('foma_inner_dock_layout', JSON.stringify(innerDockLayout)); } catch (_) {}
  }
  saveCurrentToHistory(false);
}

function handleInnerDockQuickAction(tab, grp, act) {
  const layout = getCleanInnerLayout(tab);
  layout._userCustomized = true;
  let curCol = -1, curIdx = -1;
  layout.columns.forEach((col, ci) => {
    const idx = col.indexOf(grp);
    if (idx >= 0) { curCol = ci; curIdx = idx; }
  });
  if (curCol === -1) return;

  if (act === 'left' && curCol > 0) {
    layout.columns[curCol].splice(curIdx, 1);
    layout.columns[curCol - 1].push(grp);
  } else if (act === 'right' && curCol < layout.columns.length - 1) {
    layout.columns[curCol].splice(curIdx, 1);
    layout.columns[curCol + 1].push(grp);
  } else if (act === 'up' && curIdx > 0) {
    const [item] = layout.columns[curCol].splice(curIdx, 1);
    layout.columns[curCol].splice(curIdx - 1, 0, item);
  } else if (act === 'down' && curIdx < layout.columns[curCol].length - 1) {
    const [item] = layout.columns[curCol].splice(curIdx, 1);
    layout.columns[curCol].splice(curIdx + 1, 0, item);
  }

  saveInnerDockLayout();
  ui();
}

let draggedInnerCard = null;

function setupInnerDockDragAndDrop() {
  const headers = document.querySelectorAll('.inner-card-header');
  headers.forEach(hdr => {
    hdr.addEventListener('dragstart', e => {
      const tab = hdr.dataset.innerTab;
      const grp = hdr.dataset.innerGrp;
      draggedInnerCard = { tab, grp };
      e.dataTransfer.setData('text/plain', JSON.stringify({ inner: true, tab, grp }));
      e.dataTransfer.effectAllowed = 'move';
      hdr.closest('.inner-dock-card')?.classList.add('is-dragging');
      document.querySelectorAll(`.inner-dock-container[data-inner-tab="${tab}"]`).forEach(c => c.classList.add('inner-drag-active'));
      e.stopPropagation();
    });

    hdr.addEventListener('dragend', e => {
      draggedInnerCard = null;
      document.querySelectorAll('.inner-dock-card.is-dragging').forEach(c => c.classList.remove('is-dragging'));
      document.querySelectorAll('.inner-dock-container').forEach(c => c.classList.remove('inner-drag-active'));
      document.querySelectorAll('.inner-drop-zone.drag-hover').forEach(z => z.classList.remove('drag-hover'));
      document.querySelectorAll('.inner-dock-col.drag-over-inner-col').forEach(c => c.classList.remove('drag-over-inner-col'));
      e.stopPropagation();
    });
  });

  const zones = document.querySelectorAll('.inner-drop-zone');
  zones.forEach(zone => {
    zone.addEventListener('dragover', e => {
      if (!draggedInnerCard) return;
      if (draggedInnerCard.tab !== zone.dataset.innerTab) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-hover');
      e.stopPropagation();
    });

    zone.addEventListener('dragleave', e => {
      zone.classList.remove('drag-hover');
      e.stopPropagation();
    });

    zone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-hover');
      if (!draggedInnerCard) return;

      const target = zone.dataset.target;
      const { tab, grp } = draggedInnerCard;
      if (zone.dataset.innerTab !== tab) return;

      const layout = getCleanInnerLayout(tab);
      layout._userCustomized = true;

      layout.columns.forEach(col => {
        const idx = col.indexOf(grp);
        if (idx >= 0) col.splice(idx, 1);
      });

      const matchTop = target.match(/^col-(\d+)-top$/);
      const matchAfter = target.match(/^col-(\d+)-after-(.+)$/);

      if (matchTop) {
        const cIdx = parseInt(matchTop[1], 10);
        if (layout.columns[cIdx]) layout.columns[cIdx].unshift(grp);
      } else if (matchAfter) {
        const cIdx = parseInt(matchAfter[1], 10);
        const targetGrp = matchAfter[2];
        if (layout.columns[cIdx]) {
          const afterIdx = layout.columns[cIdx].indexOf(targetGrp);
          if (afterIdx >= 0) {
            layout.columns[cIdx].splice(afterIdx + 1, 0, grp);
          } else {
            layout.columns[cIdx].push(grp);
          }
        }
      }

      saveInnerDockLayout();
      ui();
    });
  });

  const cols = document.querySelectorAll('.inner-dock-col');
  cols.forEach(col => {
    col.addEventListener('dragover', e => {
      if (!draggedInnerCard) return;
      if (draggedInnerCard.tab !== col.dataset.innerTab) return;
      e.preventDefault();
      col.classList.add('drag-over-inner-col');
    });

    col.addEventListener('dragleave', e => {
      col.classList.remove('drag-over-inner-col');
    });

    col.addEventListener('drop', e => {
      if (!draggedInnerCard) return;
      col.classList.remove('drag-over-inner-col');
      if (e.target.classList.contains('inner-drop-zone')) return;

      const targetCol = parseInt(col.dataset.innerCol, 10);
      const { tab, grp } = draggedInnerCard;
      if (col.dataset.innerTab !== tab || isNaN(targetCol)) return;

      e.preventDefault();
      e.stopPropagation();

      const layout = getCleanInnerLayout(tab);
      layout._userCustomized = true;
      layout.columns.forEach(c => {
        const idx = c.indexOf(grp);
        if (idx >= 0) c.splice(idx, 1);
      });
      layout.columns[targetCol].push(grp);
      saveInnerDockLayout();
      ui();
    });
  });

  document.querySelectorAll('.btn-inner-tool').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const tab = btn.dataset.innerTab;
      const grp = btn.dataset.innerGrp;
      const act = btn.dataset.innerAct;
      handleInnerDockQuickAction(tab, grp, act);
    };
  });
}

function paneHtml(tab) {
  const off = (k, v) => sel.length && !okSel(k, v, ss());
  const em = exact('m'), ec = exact('c'), k1 = sel.length === 1 ? toks[sel[0]] : null;
  let h = '';

  if (tab === 'pos') {
    h += '<div class="gb-wrap">';
    h += `<div class="gb gb-pos"><div class="grp">${L('Часть речи', 'Part of speech')}${k1 ? ' — “' + k1.t + '”' : ''}</div>`;
    h += `<div class="chips ${k1 ? '' : 'dis'}">${PK.map(p => btn('p', p, PO[p][0], k1 && k1.p === p, k1 && off('p', p) ? 'off' : '')).join('')}</div>`;
    if (k1 && k1.p && PO[k1.p] && PO[k1.p][2]) {
      PO[k1.p][2].forEach(g => h += `<div class="chips sub">${g.map(v => btn('ps', v, v, (k1.s || []).includes(v))).join('')}</div>`);
    }
    h += '</div></div>';
  } else if (tab === 'm') {
    const cardsMap = {};
    MG.forEach(([g, a]) => {
      cardsMap[g] = `<div class="chips grid">${a.map(([n, s, k]) => `<button class="mem ${em && em.v === n ? 'on' : ''}" data-m="${n}"${off('m', n) ? ' disabled' : ''}${ttl('m:' + n, off('m', n) ? why('m', n) : '')}>${sw(s)}<b>${n}</b>${k ? `<kbd>${k}</kbd>` : ''}</button>`).join('')}</div>`;
    });
    h += renderInnerDock('m', cardsMap);
  } else if (tab === 'c') {
    const cardsMap = {};
    CG.forEach(([g, a]) => {
      cardsMap[g] = `<div class="chips">${a.map(n => btn('c', n, n, ec && ec.v === n, off('c', n) ? 'off' : '')).join('')}</div>`;
    });
    h += renderInnerDock('c', cardsMap);
  } else if (tab === 'f') {
    const TF_NAMES = ['Tense', 'Aspect', 'Voice', 'Mood'];
    const cardsMap = {};
    TFG.forEach((g, gi) => {
      const gName = TF_NAMES[gi] || `Group ${gi + 1}`;
      cardsMap[gName] = `<div class="chips">${g.map(v => btn('f', gi + '|' + v, v, FS[gi] === v, off('f', v) ? 'off' : '')).join('')}</div>`;
    });
    h += renderInnerDock('f', cardsMap);
  } else if (tab === 'ai') {
    const prov = AI.provider || 'groq';
    const cfg = PROVIDERS[prov] || PROVIDERS.groq;
    const curKey = AI.keys[prov] || '';
    const hasKey = !!curKey;
    const curModel = AI.activeModel[prov] || cfg.defaultModel;
    const modelList = AI.models[prov] || [];

    h += `<div class="gb gb-ai"><div class="grp">${L('Проверка AI', 'AI Check')} · ${esc(cfg.name)} ${hasKey ? L('· ключ сохранён', '· key saved') : L('· нет ключа', '· no key yet')}</div>`;
    h += `<div class="chips" style="align-items:center; flex-wrap:wrap; gap:8px;">
      <select id="aip" class="ai-provider-select" title="${L('Выберите сервис проверки', 'Select checking provider')}">
        <option value="groq"${prov === 'groq' ? ' selected' : ''}>Groq (Fast OSS / GPT-OSS)</option>
        <option value="positionapi"${prov === 'positionapi' ? ' selected' : ''}>PositionAPI (Aggregator)</option>
        <option value="custom"${prov === 'custom' ? ' selected' : ''}>Custom OpenAI-compatible</option>
      </select>
      ${prov === 'custom' ? `<input id="aiurl" value="${esc(AI.customUrl)}" placeholder="Base URL (http://localhost:11434/v1)" style="flex:1 1 200px;padding:6px 9px;border:1px solid #d9d6cf;border-radius:8px">` : ''}
      <input type="password" id="aik" placeholder="${hasKey ? L('Ключ сохранён — вставьте для замены', 'Key saved — paste to replace') : cfg.keyPlaceholder}" autocomplete="off" style="flex:1 1 220px;padding:6px 9px;border:1px solid #d9d6cf;border-radius:8px">
      <input id="aim" list="ml" value="${esc(curModel)}" style="width:190px;padding:6px 9px;border:1px solid #d9d6cf;border-radius:8px" aria-label="Model">
      <datalist id="ml">${modelList.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      <select id="ail">${['Russian', 'English'].map(l => `<option${AI.lang === l ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button data-ai="save">${L('Сохранить', 'Save')}</button>
      <button data-ai="models">${L('Список моделей', 'Load models')}</button>
      ${hasKey ? `<button data-ai="rm">${L('Удалить ключ', 'Remove key')}</button>` : ''}
    </div>`;
    h += `<div class="note">${prov === 'groq' ? (TL === 'ru' ? 'Groq обеспечивает мгновенный разбор (OpenAI GPT-OSS 120B/20B, Qwen 27B, Allam). Ключи начинаются с <code>gsk_</code>.' : 'Groq provides instant parsing (OpenAI GPT-OSS 120B/20B, Qwen 27B, Allam). Keys start with <code>gsk_</code>.') : prov === 'positionapi' ? (TL === 'ru' ? 'PositionAPI подключается к моделям OpenAI/Anthropic через агрегатор.' : 'PositionAPI connects to OpenAI/Anthropic models via aggregator.') : (TL === 'ru' ? 'Подключение к локальному серверу Ollama/LM Studio или любому OpenAI-совместимому API.' : 'Connect to local Ollama/LM Studio server or any OpenAI-compatible API.')} ${L('Ключи сохраняются локально в Chrome storage.', 'Keys are saved locally in Chrome storage.')}</div>`;
    h += `<div class="chips" style="margin-top:8px;"><button class="pri" data-ai="run">${L('Проверить разбор', 'Check my parse')}</button></div></div><div id="res">${AIR}</div>`;
  } else {
    const cardsMap = {};
    SG.forEach(([t, a], gi) => {
      cardsMap[t] = `<div class="chips">${a.map(v => btn('s', gi + '|' + v, v, ST[gi] === v)).join('')}</div>`;
    });
    h += renderInnerDock('s', cardsMap);
  }
  return h;
}

function applyStatic() {
  document.documentElement.lang = TL;

  const hintEl = document.querySelector('.hint');
  if (hintEl) hintEl.title = tip('u:hint');
  if ($('cp')) $('cp').title = tip('u:copy');
  if ($('trb')) $('trb').title = tip('u:tr');

  [['auto', 'auto'], ['clr', 'clr'], ['all', 'all'], ['aichk', 'aichk'], ['ins', 'ins'], ['ta', 'ta'], ['sc', 'sc'], ['lang', 'lang']].forEach(([i, k]) => {
    if ($(i)) $(i).title = tip('u:' + k);
  });
  [['multi', 'multi'], ['restr', 'restr'], ['rp', 'rp'], ['sc', 'sc']].forEach(([i, k]) => {
    const l = $(i) ? $(i).closest('label') : null;
    if (l) l.title = tip('u:' + k);
  });

  const setText = (id, ru, en) => { const el = $(id); if (el) el.textContent = L(ru, en); };
  const setHtml = (id, ru, en) => { const el = $(id); if (el) el.innerHTML = L(ru, en); };
  const setTitle = (id, ru, en) => { const el = $(id); if (el) el.title = L(ru, en); };
  const setPlaceholder = (id, ru, en) => { const el = $(id); if (el) el.placeholder = L(ru, en); };

  // Top Nav & Brand
  setText('lbl-nav-manual', 'Мой разбор', 'My Parse');
  setTitle('tab-nav-manual', 'Мой собственный интерактивный синтаксический разбор', 'My interactive sentence parsing');
  setText('lbl-nav-ai', 'Разбор ИИ', 'AI Parse');
  setTitle('tab-nav-ai', 'Разбор, сгенерированный языковой моделью ИИ', 'Sentence parsing generated by AI language model');
  setTitle('top-mode-ai-lock', 'Только чтение', 'Read only');
  setTitle('model-trigger', 'Настройки провайдера и модели ИИ', 'AI Provider and Model Settings');
  setText('lbl-ai-provider', 'Сервис', 'Provider');
  setText('lbl-ai-model', 'Модель', 'Model');
  setText('ai-key-prompt-label', 'API-ключ:', 'API Key:');
  setText('ai-key-security-hint', 'Ключ хранится локально в браузере.', 'Key is stored locally in your browser.');
  setText('btn-ai-save-inline-key', 'Сохранить', 'Save');
  setText('btn-api-key', 'Настроить ключ', 'Configure key');
  setText('lbl-ai-run', 'Заполнить', 'Run AI');
  setTitle('btn-ai-run', 'Заполнить синтаксический разбор этой языковой моделью', 'Generate parse using this model');
  setTitle('btn-json-import-ai', 'Вставить готовый JSON-разбор от ChatGPT / Gemini / Claude', 'Paste pre-made JSON parse from ChatGPT / Gemini / Claude');
  setText('top-filter-label', 'Слои:', 'Layers:');
  setText('lbl-ai-apply-manual', 'В мой разбор', 'To My Parse');
  setTitle('btn-ai-apply-manual', 'Скопировать результат ИИ в «Мой разбор» для правки', 'Copy AI result to My Parse for editing');
  setText('lbl-ai-copy-img', 'Картинка', 'Image');
  setTitle('btn-ai-copy-img', 'Скопировать изображение разбора ИИ', 'Copy AI parse image');
  setText('lbl-btn-history', 'История', 'History');
  setTitle('btn-history', 'Открыть историю предложений', 'Open sentence history');
  setTitle('btn-tips', 'Горячие клавиши и справка', 'Hotkeys & Tips');
  setTitle('btn-theme-toggle', 'Переключить тему оформления (Светлая / Тёмная)', 'Toggle theme (Light / Dark)');

  // Language buttons
  if ($('lang')) $('lang').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.l === TL));

  // Sidebar Controls
  const ed = $('ed');
  const isEditOpen = ed && !ed.classList.contains('collapsed') && ed.style.display !== 'none';
  const btn = $('btn-toggle-edit');
  if (btn) {
    btn.classList.toggle('on', !!isEditOpen);
    btn.setAttribute('aria-expanded', isEditOpen ? 'true' : 'false');
    btn.title = isEditOpen
      ? L('Скрыть поле редактирования текста', 'Hide text editing field')
      : L('Редактировать текст предложения (показать / скрыть поле)', 'Edit sentence text (show / hide field)');
  }
  setText('lbl-btn-edit-text', isEditOpen ? 'Скрыть текст' : 'Редактировать текст', isEditOpen ? 'Hide text' : 'Edit text');
  setText('auto', 'Авто (100%)', 'Auto (100%)');
  setTitle('auto', 'Автоматически расставить выбранные параметры со 100% уверенностью', 'Automatically set selected features with 100% confidence');
  setTitle('btn-auto-config', 'Настроить параметры авторасстановки (100% уверенность)', 'Configure auto 100% parameters');
  setText('lbl-btn-clr', 'Снять метки', 'Clear marks');
  setTitle('clr', 'Убрать метки с выделенных слов', 'Remove marks from selected words');
  setText('all', 'Очистить всё', 'Clear all');
  setText('lbl-btn-all', 'Очистить всё', 'Clear all');
  setTitle('all', 'Стереть всю разметку текущего предложения', 'Clear all markings for current sentence');
  setText('btn-manual-toggle-height', 'На всю высоту', 'Full height');
  setText('lbl-manual-height', 'На всю высоту', 'Full height');
  setTitle('btn-manual-toggle-height', 'Развернуть на всю высоту разбора без внутреннего скролла', 'Expand to full parse height without internal scroll');
  setText('lbl-sec-selection', 'Выделение', 'Selection');
  setText('lbl-multi-text', 'Мульти-выбор', 'Multi-select');
  setTitle('lbl-multi-wrap', 'Клик добавляет слово к выделению', 'Click adds word to selection');
  setText('lbl-restr-text', 'Строгий режим', 'Strict mode');
  setTitle('lbl-restr-wrap', 'Метки можно ставить только на подходящие части речи и члены предложения', 'Tags can only be applied to matching parts of speech and sentence members');
  setText('lbl-sec-view', 'Вид', 'View');
  setText('btn-render-color', 'Цветной', 'Color focus');
  setText('btn-render-bw', 'Ч/Б', 'B&W');
  setText('lbl-sec-text', 'Авторасстановка', 'Auto markup');
  setText('lbl-btn-import-json', 'Импорт JSON', 'Import JSON');
  setText('btn-json-import', 'Импорт JSON', 'Import JSON');
  setTitle('btn-json-import', 'Вставить готовый JSON-разбор от ChatGPT / Gemini / Claude', 'Paste pre-made JSON parse from ChatGPT / Gemini / Claude');
  setText('lbl-btn-copy-color', 'Копировать цветную', 'Copy color diagram');
  setText('lbl-btn-copy-bw', 'Копировать Ч/Б', 'Copy B&W diagram');
  setTitle('btn-copy-color-scheme', 'Скопировать цветную схему в буфер обмена', 'Copy colored diagram to clipboard');
  setTitle('btn-copy-bw-scheme', 'Скопировать классическую Ч/Б схему в буфер обмена', 'Copy classic B&W diagram to clipboard');
  setTitle('canvas-resizer', 'Потяните вверх или вниз, чтобы изменить высоту области схемы (двойной клик — сброс)', 'Drag up or down to resize diagram area (double click to reset)');

  // Sentence Editor Box
  setText('lbl-ed-title', 'Редактирование текста', 'Edit sentence');
  setText('trb', 'Перевести', 'Translate');
  setTitle('trb', 'Перевести текст предложения', 'Translate sentence text');
  setTitle('btn-close-edit', 'Закрыть редактор текста', 'Close sentence editor');
  setPlaceholder('ta', 'Введите предложение на английском...', 'Enter English sentence...');
  if ($('ta')) $('ta').setAttribute('aria-label', L('Текст предложения', 'Sentence text'));

  // AI View Subbar
  setText('btn-gran-detailed', 'Детальный', 'Detailed');
  setTitle('btn-gran-detailed', 'Подробный аналитический разбор: атрибуты отдельно, ядерное подлежащее отдельно', 'Detailed analytical parse: attributes separate, core subject separate');
  setText('btn-gran-macro', 'Составной', 'Compound');
  setTitle('btn-gran-macro', 'Составной разбор: цельное подлежащее со всеми определениями', 'Compound parse: combined subject with modifiers');
  setText('lbl-ai-toggle-height', 'На всю высоту', 'Full height');
  setTitle('btn-ai-toggle-height', 'Развернуть на всю высоту разбора без внутреннего скролла', 'Expand to full parse height without internal scroll');
  setText('ai-loading-title', 'ИИ выполняет синтаксический разбор предложения…', 'AI is parsing sentence structure…');
  setText('btn-ai-retry', 'Повторить попытку', 'Retry');
  setText('btn-ai-open-settings', 'Настройки API и модели', 'API & Model Settings');
  setTitle('canvas-resizer-ai', 'Потяните вверх или вниз, чтобы изменить высоту области схемы (двойной клик — сброс)', 'Drag up or down to resize diagram area (double click to reset)');
  setText('ai-verdict-status-ready', '✓ Разбор от ИИ готов', '✓ AI parse ready');
  setText('lbl-ai-copy-text', 'Скопировать текст', 'Copy text');
  setTitle('btn-ai-copy-text', 'Скопировать исходный текст предложения в буфер обмена', 'Copy original sentence text to clipboard');

  // Floating Footer
  setHtml('ins', 'Скопировать и закрыть <kbd>Ctrl+Enter</kbd>', 'Copy and close <kbd>Ctrl+Enter</kbd>');
  setTitle('ins', 'Скопировать изображение в буфер обмена для Google Docs (Ctrl+Enter)', 'Copy diagram image to clipboard for Google Docs (Ctrl+Enter)');

  // History Modal
  setText('hist-title', 'История разборов', 'Parse History');
  setText('hist-sub', 'Сохранённые предложения с быстрым восстановлением на холст', 'Saved sentences with instant restore to canvas');
  setTitle('hist-close', 'Закрыть (Esc)', 'Close (Esc)');
  setPlaceholder('hist-search', 'Поиск по тексту предложения…', 'Search sentence text…');
  setTitle('hist-search-clear', 'Очистить поиск', 'Clear search');
  setText('lbl-hist-clear', 'Очистить всё', 'Clear all');
  setTitle('hist-clear', 'Полностью очистить сохранённую историю', 'Completely clear saved history');
  setText('lbl-hist-export', 'Экспорт JSON', 'Export JSON');
  setTitle('hist-export', 'Экспортировать историю в файл JSON', 'Export history to JSON file');

  // JSON Import Modal
  setText('json-import-title', 'Импорт JSON-разбора от внешнего LLM', 'Import JSON parse from external LLM');
  setText('json-import-sub', 'Вставьте JSON от ChatGPT / Gemini / Claude — аддон применит его к текущему предложению', 'Paste JSON from ChatGPT / Gemini / Claude — addon will apply it to current sentence');
  setTitle('json-import-close', 'Закрыть', 'Close');
  setText('json-schema-ref-label', 'Ожидаемая структура JSON:', 'Expected JSON structure:');
  setText('btn-json-copy-prompt', 'Скопировать промпт для LLM', 'Copy prompt for LLM');
  setTitle('btn-json-copy-prompt', 'Скопировать prompt для ChatGPT/Gemini/Claude', 'Copy prompt for ChatGPT/Gemini/Claude');
  setText('lbl-json-import-ta', 'Вставьте JSON-разбор:', 'Paste JSON parse:');
  setText('btn-json-clear', 'Очистить', 'Clear');
  setText('btn-json-cancel', 'Отмена', 'Cancel');
  setText('btn-json-apply', 'Применить разбор', 'Apply parse');

  // Auto 100% Config Modal
  setText('auto-config-title', 'Авторасстановка со 100% уверенностью', 'Auto 100% Confidence Parsing');
  setText('auto-config-sub', 'Выберите параметры для авторазметки. Включены только строгие лингвистические инварианты без догадок.', 'Select features for auto-marking. Strictly linguistically invariant patterns only.');
  setTitle('auto-config-close', 'Закрыть', 'Close');
  setText('auto-presets-label', 'Пресеты:', 'Presets:');
  document.querySelectorAll('.btn-auto-preset').forEach(b => {
    const p = b.dataset.preset;
    if (p === 'all') b.textContent = L('Все 100% параметры', 'All 100% features');
    else if (p === 'pos_only') b.textContent = L('Только части речи (POS)', 'Parts of speech only');
    else if (p === 'func_only') b.textContent = L('Только служебные слова', 'Function words only');
    else if (p === 'clear') b.textContent = L('Снять всё', 'Clear all');
  });
  const grpTitles = document.querySelectorAll('.auto-rule-group-title');
  if (grpTitles[0]) grpTitles[0].textContent = L('Части речи и морфология (POS)', 'Parts of Speech & Morphology (POS)');
  if (grpTitles[1]) grpTitles[1].textContent = L('Тип предложения и полярность (Sentence ST)', 'Sentence Characteristics & Polarity');
  if (grpTitles[2]) grpTitles[2].textContent = L('Члены предложения и залог (Members & Voice)', 'Sentence Members & Voice');

  if (typeof AUTO_100_RULES_INFO !== 'undefined') {
    Object.keys(AUTO_100_RULES_INFO).forEach(id => {
      const input = $(id);
      if (!input) return;
      const item = input.closest('.auto-rule-item');
      if (!item) return;
      const nameEl = item.querySelector('.auto-rule-name');
      const descEl = item.querySelector('.auto-rule-desc');
      const info = AUTO_100_RULES_INFO[id];
      if (nameEl && info?.title) nameEl.textContent = L(info.title.ru, info.title.en);
      if (descEl && info?.desc) descEl.innerHTML = L(info.desc.ru, info.desc.en);
    });
  }
  setText('auto-config-stats', 'Настройки сохраняются автоматически', 'Settings are saved automatically');
  setText('btn-auto-config-close', 'Готово', 'Done');
  setText('btn-auto-config-apply', 'Применить к предложению', 'Apply to sentence');

  // Settings Modal
  setText('lbl-settings-heading', 'Настройки синтаксического разбора', 'Sentence Parser Settings');
  setText('lbl-settings-sub', 'Формат подписей, режим подчёркиваний и параметры интерфейса', 'Label formatting, underline styles and UI preferences');
  setTitle('btn-settings-close', 'Закрыть (Esc)', 'Close (Esc)');
  setText('lbl-cfg-parts-title', 'Отображение членов предложения', 'Sentence Parts Display');
  setText('lbl-cfg-parts-desc', 'Выберите, как оформлять грамматические роли слов на схеме предложения:', 'Select formatting style for grammatical roles below words:');
  setText('lbl-opt-combo-name', 'Комбинация: подчёркивание и сокр. имя', 'Combination: underline & short name');
  setText('lbl-opt-combo-tag', 'Рекомендуется', 'Recommended');
  setText('lbl-opt-combo-desc', 'Школьные символы подчёркивания (═, —, ╍, 〰) вместе с кратким обозначением роли под словом (Pred, Subj, DirObj)', 'School underline symbols (═, —, ╍, 〰) with short grammatical tags (Pred, Subj, DirObj)');
  setText('lbl-opt-full-name', 'Словами (полные названия)', 'Full words (complete names)');
  setText('lbl-opt-full-desc', 'Полные текстовые наименования членов предложения (Predicate, Subject, Direct object)', 'Complete word names for sentence members (Predicate, Subject, Direct object)');
  setText('lbl-opt-short-name', 'Сокращёнными словами', 'Abbreviated words');
  setText('lbl-opt-short-desc', 'Лаконичные текстовые сокращения грамматических ролей (Pred, Subj, DirObj)', 'Concise grammatical role abbreviations (Pred, Subj, DirObj)');
  setText('lbl-opt-symbols-name', 'Только символами подчёркивания', 'Underlines only (no text labels)');
  setText('lbl-opt-symbols-desc', 'Классическая школьная графическая схема (═ для сказуемого, — для подлежащего, ╍ для дополнения) без текстовых надписей', 'Classic graphic underlines (═, —, ╍, 〰) without text labels');
  setText('lbl-cfg-ui-title', 'Интерфейс и подсказки', 'Interface & Controls');
  setText('lbl-cfg-popover-title', 'Всплывающая панель у выделенного слова', 'Floating word selection popover');
  setText('lbl-cfg-popover-desc', 'Отображать компактный поповер с быстрыми метками активного слоя и горячими клавишами прямо под выделенным словом', 'Show quick tag popover with shortcut badges directly at selected word');
  setText('lbl-cfg-popover-layout-title', 'Ориентация всплывающей панели', 'Popover layout orientation');
  setText('lbl-cfg-popover-layout-desc', 'Отображать метки под словом компактными строками (чипами) или вертикальным списком в столбец', 'Display tags below word in wrapping rows (chips) or as a vertical column');
  setText('btn-layout-row', 'Строка', 'Row');
  setText('btn-layout-col', 'Столбец', 'Column');
  setTitle('btn-layout-row', 'Горизонтальные чипы в несколько строк', 'Horizontal chips wrapping in rows');
  setTitle('btn-layout-col', 'Вертикальный список в один столбец', 'Vertical list in a single column');
  setText('lbl-cfg-progress-title', 'Полоса прогресса разметки предложения', 'Sentence parsing progress bar');
  setText('lbl-cfg-progress-desc', 'Тонкая полоса под шапкой, показывающая процент разобранных слов в предложении', 'Thin indicator bar below the header showing percentage of parsed words');
  setText('lbl-settings-status', 'Настройки сохраняются автоматически', 'Settings are saved automatically');
  setText('btn-settings-done', 'Готово', 'Done');
  setTitle('btn-settings', 'Настройки сайта (Ctrl+,)', 'Site Settings (Ctrl+,)');
  setText('lbl-sidebar-settings', 'Настройки', 'Settings');
  setTitle('btn-sidebar-settings', 'Настройки отображения и сайта', 'Display and site settings');

  setupLayerFilterToolbar();
  updateAiKeyInlineBar();
}

$('lang').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  TL = b.dataset.l;
  chrome.storage?.local?.set({ tl: TL });
  applyStatic();
  ui();
  render();
  renderHistoryUI();
  if ($('view-ai') && $('view-ai').style.display !== 'none') {
    renderAiCanvas();
  }
};

function cleanDockLayout(layout) {
  if (!layout) layout = {};
  if (!Array.isArray(layout.topFull)) layout.topFull = [];
  if (!Array.isArray(layout.bottomFull)) layout.bottomFull = [];
  if (!Array.isArray(layout.columns)) layout.columns = [['m', 'c', 's'], ['pos', 'f']];

  // Strip ai unconditionally
  layout.topFull = layout.topFull.filter(p => p !== 'ai');
  layout.bottomFull = layout.bottomFull.filter(p => p !== 'ai');
  layout.columns = layout.columns.map(col => (Array.isArray(col) ? col.filter(p => p !== 'ai') : []));

  layout.columns = layout.columns.filter(col => Array.isArray(col) && col.length > 0);
  if (!layout.columns.length && !layout.topFull.length && !layout.bottomFull.length) {
    layout.columns = [['m', 'c', 's'], ['pos', 'f']];
  }
  while (layout.columns.length > 3) {
    const last = layout.columns.pop();
    layout.columns[2].push(...last);
  }

  const allPanels = ['m', 'pos', 'c', 'f', 's'];
  const present = new Set([...layout.topFull, ...layout.bottomFull, ...layout.columns.flat()]);
  allPanels.forEach(p => {
    if (!present.has(p)) {
      if (!layout.columns.length) layout.columns = [[]];
      layout.columns[0].push(p);
    }
  });

  if (tab === 'ai') tab = 'm';
  return layout;
}

function saveDockLayout() {
  chrome.storage?.local?.set({ foma_dock_layout: dockLayout });
  saveCurrentToHistory(false);
}

let draggedPanelKey = null;

function setupDockDragAndDrop() {
  const pane = $('pane');
  if (!pane) return;

  pane.querySelectorAll('h2.sec').forEach(header => {
    header.addEventListener('dragstart', e => {
      draggedPanelKey = header.dataset.panel;
      e.dataTransfer.setData('text/plain', draggedPanelKey);
      e.dataTransfer.effectAllowed = 'move';
      const section = header.closest('section.sx');
      if (section) section.classList.add('is-dragging');
      pane.classList.add('dock-active-mode');
    });

    header.addEventListener('dragend', () => {
      draggedPanelKey = null;
      pane.classList.remove('dock-active-mode');
      pane.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      pane.querySelectorAll('.drag-hover').forEach(el => el.classList.remove('drag-hover'));
      pane.querySelectorAll('.drag-over-col').forEach(el => el.classList.remove('drag-over-col'));
    });
  });

  pane.querySelectorAll('[data-drop-target]').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    zone.addEventListener('dragenter', e => {
      e.preventDefault();
      zone.classList.add('drag-hover');
    });

    zone.addEventListener('dragleave', e => {
      zone.classList.remove('drag-hover');
    });

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-hover');
      const target = zone.dataset.dropTarget;
      if (!draggedPanelKey || !target) return;
      handleDockDrop(draggedPanelKey, target);
    });
  });
}

function handleDockDrop(panelKey, target) {
  dockLayout.topFull = dockLayout.topFull.filter(p => p !== panelKey);
  dockLayout.bottomFull = dockLayout.bottomFull.filter(p => p !== panelKey);
  dockLayout.columns = dockLayout.columns.map(col => col.filter(p => p !== panelKey));

  if (target === 'top-full') {
    dockLayout.topFull.push(panelKey);
  } else if (target === 'bottom-full') {
    dockLayout.bottomFull.push(panelKey);
  } else if (target === 'col-new-left') {
    dockLayout.columns.unshift([panelKey]);
  } else if (target === 'col-new-right') {
    dockLayout.columns.push([panelKey]);
  } else if (target.startsWith('col-')) {
    const parts = target.split('-');
    const colIdx = parseInt(parts[1], 10);
    if (!dockLayout.columns[colIdx]) dockLayout.columns[colIdx] = [];

    if (parts[2] === 'top') {
      dockLayout.columns[colIdx].unshift(panelKey);
    } else if (parts[2] === 'bottom') {
      dockLayout.columns[colIdx].push(panelKey);
    } else if (parts[2] === 'after') {
      const pos = parseInt(parts[3], 10);
      dockLayout.columns[colIdx].splice(pos + 1, 0, panelKey);
    }
  }

  cleanDockLayout(dockLayout);
  saveDockLayout();
  ui();
}

function handleDockQuickAction(act, panelKey) {
  if (act === 'span') {
    if (dockLayout.topFull.includes(panelKey) || dockLayout.bottomFull.includes(panelKey)) {
      dockLayout.topFull = dockLayout.topFull.filter(p => p !== panelKey);
      dockLayout.bottomFull = dockLayout.bottomFull.filter(p => p !== panelKey);
      if (!dockLayout.columns.length) dockLayout.columns = [[]];
      dockLayout.columns[0].push(panelKey);
    } else {
      dockLayout.columns = dockLayout.columns.map(col => col.filter(p => p !== panelKey));
      dockLayout.topFull.push(panelKey);
    }
  } else if (act === 'left') {
    let curCol = -1, curIdx = -1;
    dockLayout.columns.forEach((col, ci) => {
      const idx = col.indexOf(panelKey);
      if (idx >= 0) { curCol = ci; curIdx = idx; }
    });
    if (curCol > 0) {
      dockLayout.columns[curCol].splice(curIdx, 1);
      dockLayout.columns[curCol - 1].push(panelKey);
    } else if (curCol === 0 && dockLayout.columns.length < 3) {
      dockLayout.columns[curCol].splice(curIdx, 1);
      dockLayout.columns.unshift([panelKey]);
    } else if (curCol === -1) {
      dockLayout.topFull = dockLayout.topFull.filter(p => p !== panelKey);
      dockLayout.bottomFull = dockLayout.bottomFull.filter(p => p !== panelKey);
      if (!dockLayout.columns.length) dockLayout.columns = [[]];
      dockLayout.columns[0].unshift(panelKey);
    }
  } else if (act === 'right') {
    let curCol = -1, curIdx = -1;
    dockLayout.columns.forEach((col, ci) => {
      const idx = col.indexOf(panelKey);
      if (idx >= 0) { curCol = ci; curIdx = idx; }
    });
    if (curCol >= 0 && curCol < dockLayout.columns.length - 1) {
      dockLayout.columns[curCol].splice(curIdx, 1);
      dockLayout.columns[curCol + 1].push(panelKey);
    } else if (curCol >= 0 && curCol === dockLayout.columns.length - 1 && dockLayout.columns.length < 3) {
      dockLayout.columns[curCol].splice(curIdx, 1);
      dockLayout.columns.push([panelKey]);
    } else if (curCol === -1) {
      dockLayout.topFull = dockLayout.topFull.filter(p => p !== panelKey);
      dockLayout.bottomFull = dockLayout.bottomFull.filter(p => p !== panelKey);
      if (!dockLayout.columns.length) dockLayout.columns = [[]];
      const lastCol = dockLayout.columns.length - 1;
      dockLayout.columns[lastCol].push(panelKey);
    }
  }

  cleanDockLayout(dockLayout);
  saveDockLayout();
  ui();
}

function ui() {
  const y = window.scrollY;
  const isDock = VIEW === 'grid' || VIEW === 'dock';
  const isCol1 = VIEW === 'col1' || VIEW === 'scroll';
  const isMulti = isDock || isCol1;
  const colsCount = dockLayout.columns.length;
  const viewBtnLabel = isDock ? (TL === 'ru' ? `Вид: ${colsCount} кол.` : `View: ${colsCount} cols`) : isCol1 ? (TL === 'ru' ? 'Вид: 1 колонка' : 'View: 1 col') : (TL === 'ru' ? 'Вид: вкладки' : 'View: tabs');

  $('tabs').innerHTML = TABS.map(([k]) => btn('t', k, `<i class="dot" style="background:${DOT[CI[k]]}"></i>${getTabTitle(k)}`, !isMulti && tab === k)).join('') + `
    <div class="tabs-view-controls">
      <button type="button" class="btn-tab-layout ${isDock && colsCount === 1 && !dockLayout.topFull.length ? 'active' : ''}" data-layout="1" title="${L('1 колонка (во всю ширину)', '1 column (full width)')}">1 ${L('колонка', 'col')}</button>
      <button type="button" class="btn-tab-layout ${isDock && colsCount === 2 && !dockLayout.topFull.length ? 'active' : ''}" data-layout="2" title="${L('2 колонки (50% / 50%)', '2 columns (50% / 50%)')}">2 ${L('колонки', 'cols')}</button>
      <button type="button" class="btn-tab-layout ${isDock && colsCount === 3 && !dockLayout.topFull.length ? 'active' : ''}" data-layout="3" title="${L('3 колонки (33% / 33% / 33%)', '3 columns (33% / 33% / 33%)')}">3 ${L('колонки', 'cols')}</button>
      <button type="button" class="btn-tab-layout" data-layout="reset" title="${L('Сбросить расположение по умолчанию', 'Reset layout to default')}">↺</button>
      <button class="viewbtn" data-v="1" ${ttl('u:view')}>${viewBtnLabel}</button>
    </div>
  `;
  $('pane').className = isDock ? 'dock-grid' : isCol1 ? 'scr' : 't' + CI[tab];

  const sec = (k, isFull = false) => {
    const t = getTabTitle(k);
    const isSingleCol = isDock && dockLayout.columns.length === 1 && !dockLayout.topFull.length && !dockLayout.bottomFull.length;
    const effectivelyFull = isFull || isSingleCol;
    return `
      <section class="sx t${CI[k]} ${effectivelyFull ? 'is-full-width' : ''}" id="sx-${k}" data-panel="${k}">
        <h2 class="sec" id="sec-${k}" draggable="true" data-panel="${k}" title="${L('Потяните за заголовок, чтобы перетащить панель (как в After Effects)', 'Drag header to reposition panel (After Effects style)')}">
          <span class="dock-drag-handle" title="${L('Потяните для перемещения панели', 'Drag to reposition')}">⋮⋮</span>
          <i class="dot" style="background:${DOT[CI[k]]}"></i>
          <span class="sec-title">${t}</span>
          <div class="dock-panel-tools">
            <button type="button" class="btn-dock-tool" data-dock-act="left" data-panel="${k}" title="${L('Переместить в левую колонку', 'Move to left column')}">⇇ ${L('Слева', 'Left')}</button>
            <button type="button" class="btn-dock-tool ${isFull ? 'active' : ''}" data-dock-act="span" data-panel="${k}" title="${L('Развернуть во всю строку / В колонку', 'Toggle full row / column')}">${isFull ? '⊟ ' + L('В колонку', 'In col') : '↔ ' + L('Во всю строку', 'Full row')}</button>
            <button type="button" class="btn-dock-tool" data-dock-act="right" data-panel="${k}" title="${L('Переместить в правую колонку', 'Move to right column')}">⇉ ${L('Справа', 'Right')}</button>
          </div>
        </h2>
        ${paneHtml(k)}
      </section>
    `;
  };

  if (isDock) {
    cleanDockLayout(dockLayout);
    let html = '';

    html += `<div class="dock-drop-zone dock-drop-top" data-drop-target="top-full">↔ ${L('Перетащите сюда для расположения во всю строку сверху', 'Drop here for full-width row at top')}</div>`;
    if (dockLayout.topFull.length) {
      html += `<div class="dock-full-row dock-full-top">${dockLayout.topFull.map(k => sec(k, true)).join('')}</div>`;
    }

    html += `<div class="dock-columns-container">`;
    if (dockLayout.columns.length < 3) {
      html += `<div class="dock-drop-side-zone dock-drop-side-left" data-drop-target="col-new-left" title="${L('Создать новую колонку слева', 'Create new column on left')}">+ ${L('Новая колонка слева', 'New column left')}</div>`;
    }

    dockLayout.columns.forEach((colPanels, colIdx) => {
      html += `
        <div class="dock-col dock-col-${colIdx}" data-col="${colIdx}">
          <div class="dock-drop-zone dock-drop-col-top" data-drop-target="col-${colIdx}-top">↓ ${L(`В начало колонки ${colIdx + 1}`, `Top of column ${colIdx + 1}`)}</div>
          ${colPanels.map((k, pIdx) => `
            ${sec(k, false)}
            <div class="dock-drop-zone dock-drop-between" data-drop-target="col-${colIdx}-after-${pIdx}">↓ ${L('Вставить сюда', 'Insert here')}</div>
          `).join('')}
          <div class="dock-drop-zone dock-drop-col-bottom" data-drop-target="col-${colIdx}-bottom">↓ ${L(`В конец колонки ${colIdx + 1}`, `Bottom of column ${colIdx + 1}`)}</div>
        </div>
      `;
    });

    if (dockLayout.columns.length < 3) {
      html += `<div class="dock-drop-side-zone dock-drop-side-right" data-drop-target="col-new-right" title="${L('Создать новую колонку справа', 'Create new column on right')}">+ ${L('Новая колонка справа', 'New column right')}</div>`;
    }
    html += `</div>`;

    if (dockLayout.bottomFull.length) {
      html += `<div class="dock-full-row dock-full-bottom">${dockLayout.bottomFull.map(k => sec(k, true)).join('')}</div>`;
    }
    html += `<div class="dock-drop-zone dock-drop-bottom" data-drop-target="bottom-full">↔ ${L('Перетащите сюда для расположения во всю строку снизу', 'Drop here for full-width row at bottom')}</div>`;

    $('pane').innerHTML = html;
    setupDockDragAndDrop();
    setupInnerDockDragAndDrop();
  } else if (isCol1) {
    $('pane').innerHTML = TABS.map(([k]) => sec(k, true)).join('');
    setupInnerDockDragAndDrop();
  } else {
    $('pane').innerHTML = paneHtml(tab);
    setupInnerDockDragAndDrop();
  }

  window.scrollTo(0, y);
  applyStatic();
}

function selChanged() {
  if (sel.length > 1 && tab === 'pos') tab = 'm';
  const e = exact('f');
  FS = e && e.f ? [...e.f] : ['', '', '', ''];
  const clrBtn = $('clr');
  if (clrBtn) clrBtn.disabled = (sel.length === 0);
  render();
  ui();
  updateWordPopover();
  updateSidebarPalette();
  updateProgressBar();
}

/* ---------- editing ---------- */
function setA(k, v, f, force) {
  if (!sel.length) return msg(TL === 'ru' ? 'Сначала выберите слова.' : 'Select words first.');
  const s = ss(), ex = exact(k);
  if (v && !(ex && ex.v === v && !force) && !okSel(k, v, s)) {
    return msg('“' + (k === 'f' ? (TL === 'ru' ? 'Время / залог / наклонение' : 'Tense / voice / mood') : v) + '” — ' + why(k, v, s) + (TL === 'ru' ? ' (Снимите галочку «Ограничивать по…», чтобы обойти)' : ' (Untick “restrict…” to override.)'));
  }
  if (k === 'm') {
    if (ex && ex.v === v && !force) {
      an = an.filter(a => a !== ex);
    } else {
      an.forEach(a => {
        if (a.k === 'm') {
          a.ix = a.ix.filter(i => !s.includes(i));
        }
      });
      an = an.filter(a => a.k !== 'm' || a.ix.length > 0);
      if (v) an.push({ k: 'm', v, ix: s });
    }
  } else if (k === 'f') {
    if (ex && ex.v === v && !force) {
      an = an.filter(a => a !== ex);
    } else {
      an.forEach(a => {
        if (a.k === 'f') {
          a.ix = a.ix.filter(i => !s.includes(i));
        }
      });
      an = an.filter(a => a.k !== 'f' || a.ix.length > 0);
      if (v) an.push({ k: 'f', v, ix: s, f });
    }
  } else if (ex) {
    if (!v || (!force && ex.v === v)) an.splice(an.indexOf(ex), 1);
    else { ex.v = v; if (f) ex.f = f; }
  } else if (v) an.push({ k, v, ix: s, f });

  if (k === 'm' && v !== 'Predicate') {
    an = an.filter(a => !(a.k === 'f' && a.ix.some(i => s.includes(i))));
  }

  if (v) {
    if (k === 'm') ensureLayerItemVisible('parts', v);
    else if (k === 'c') ensureLayerItemVisible('clauses', v);
    else if (k === 'f') ensureLayerVisible('tenses');
  }

  saveCurrentToHistory(false);
  render();
  ui();
}

function setP(p, force = false, toggle = true) {
  if (!sel || !sel.length) return msg(TL === 'ru' ? 'Сначала выберите слова.' : 'Select words first.');
  const targets = sel.map(i => toks[i]).filter(Boolean);
  if (!targets.length) return;

  if ($('restr')?.checked && !force && !okSel('p', p, ss())) {
    return msg('“' + (PO[p] ? PO[p][0] : p) + '” — ' + why('p', p, ss()) + (TL === 'ru' ? ' (Снимите галочку «Ограничивать…», чтобы обойти)' : ' (Untick “restrict…” to override.)'));
  }

  targets.forEach(k => {
    if (toggle && k.p === p) {
      k.p = null;
      k.s = null;
    } else {
      k.p = p;
      k.s = Array.isArray(k.s) ? k.s : [];
      ensureLayerItemVisible('pos', p);
    }
  });

  saveCurrentToHistory(false);
  render();
  ui();
}

function togSub(v) {
  if (!sel || !sel.length) return;
  const targets = sel.map(i => toks[i]).filter(Boolean);
  if (!targets.length) return;
  const primary = targets[0];
  if (!primary || !primary.p || !PO[primary.p] || !PO[primary.p][2]) return;
  const gs = PO[primary.p][2], g = gs.find(x => x.includes(v));
  if (!g) return;

  targets.forEach(k => {
    if (!k.p || k.p !== primary.p) return;
    k.s = Array.isArray(k.s) ? k.s : [];
    if (k.s.includes(v)) {
      k.s = k.s.filter(x => x !== v);
    } else {
      k.s = [...k.s.filter(x => !g.includes(x)), v];
      ensureLayerItemVisible('pos', 'subs');
    }
    const flat = gs.flat();
    k.s.sort((a, b) => flat.indexOf(a) - flat.indexOf(b));
  });

  saveCurrentToHistory(false);
  render();
  ui();
}

function del() {
  const s = ss();
  if (!s.length) return;
  const ex = an.filter(a => same(sorted(a), s));
  if (ex.length) an = an.filter(a => !ex.includes(a));
  else {
    an.forEach(a => a.ix = a.ix.filter(i => !sel.includes(i)));
    an = an.filter(a => a.ix.length);
    sel.forEach(i => { toks[i].p = null; toks[i].s = null; });
  }
  saveCurrentToHistory(false);
  render();
  ui();
}

$('tabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.layout) {
    const l = b.dataset.layout;
    if (l === '1') {
      dockLayout = { topFull: [], columns: [['m', 'pos', 'c', 'f', 's']], bottomFull: [] };
    } else if (l === '2') {
      dockLayout = { topFull: [], columns: [['m', 'c', 's'], ['pos', 'f']], bottomFull: [] };
    } else if (l === '3') {
      dockLayout = { topFull: [], columns: [['m'], ['pos', 'f'], ['c', 's']], bottomFull: [] };
    } else if (l === 'reset') {
      dockLayout = { topFull: [], columns: [['m', 'c', 's'], ['pos', 'f']], bottomFull: [] };
      innerDockLayout = JSON.parse(JSON.stringify(DEFAULT_INNER_DOCK_LAYOUT));
      saveInnerDockLayout();
    }
    VIEW = 'grid';
    saveDockLayout();
    ui();
    return;
  }
  if (b.dataset.v) {
    if (VIEW === 'grid') VIEW = 'col1';
    else if (VIEW === 'col1' || VIEW === 'scroll') VIEW = 'tabs';
    else VIEW = 'grid';
    chrome.storage?.local?.set({ view: VIEW });
    ui();
    return;
  }
  tab = b.dataset.t;
  ui();
  if (VIEW === 'scroll' || VIEW === 'col1' || VIEW === 'grid') {
    const el = $('sec-' + tab);
    if (el) window.scrollTo({ top: el.offsetTop - $('top').offsetHeight + 4, behavior: 'smooth' });
  }
};

$('pane').oninput = e => {
  if (e.target.id === 'aim') AI.model = e.target.value;
  if (e.target.id === 'ail') AI.lang = e.target.value;
};

$('pane').onclick = e => {
  const dockBtn = e.target.closest('.btn-dock-tool');
  if (dockBtn && dockBtn.dataset.dockAct && dockBtn.dataset.panel) {
    handleDockQuickAction(dockBtn.dataset.dockAct, dockBtn.dataset.panel);
    return;
  }
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.ai) return aiAct(d.ai, d.i);
  if (d.p) setP(d.p);
  else if (d.ps) togSub(d.ps);
  else if (d.m) setA('m', d.m);
  else if (d.c) setA('c', d.c);
  else if (d.f) {
    const [g, v] = d.f.split('|');
    FS[+g] = FS[+g] === v ? '' : v;
    const l = FS.filter(Boolean).join(' ');
    if (!sel.length) { ui(); return msg('Select words first (your choice is kept).'); }
    setA('f', l, [...FS], true);
  } else if (d.s) {
    const [g, v] = d.s.split('|');
    ST[+g] = ST[+g] === v ? '' : v;
    if (ST[+g]) ensureLayerItemVisible('st', ST[+g]);
    saveCurrentToHistory(false);
    render();
    ui();
  }
};

$('clr').onclick = del;
if ($('aichk')) $('aichk').onclick = () => { switchTopMode('ai'); };

/* ---------- Canvas Schema Renderer for AI / Custom States ---------- */
function renderCustomSchema(targetCv, cToks, cAn, cST, scale = 70, customPixelRatio = null, layers = aiLayers, preserveLines = false) {
  if (!targetCv || !cToks || !cToks.length) return;
  ensureLayerItems(layers);
  cToks = ensureToksSpacing(cToks, toks);
  const ctx = targetCv.getContext('2d');
  const d = customPixelRatio || window.devicePixelRatio || 1;
  const parentW = targetCv.parentElement?.clientWidth || $('wrap-ai')?.clientWidth || $('wrap')?.clientWidth || 800;
  const W = Math.max(300, parentW);
  const textStr = cToks.filter(k => k.word).map(k => k.t).join(' ');
  if (textStr) {
    targetCv.setAttribute('aria-label', `Синтаксическая схема: "${textStr}"`);
  }

  const showPos = layers?.pos !== false;
  const showParts = layers?.parts !== false;
  const showClauses = layers?.clauses !== false;
  const showTenses = layers?.tenses !== false;
  const showST = layers?.st !== false;

  const posItems = layers?.pos_items || DEFAULT_POS_ITEMS;
  const partsItems = layers?.parts_items || DEFAULT_PARTS_ITEMS;
  const clausesItems = layers?.clauses_items || DEFAULT_CLAUSES_ITEMS;
  const tensesItems = layers?.tenses_items || DEFAULT_TENSES_ITEMS;
  const stItems = layers?.st_items || DEFAULT_ST_ITEMS;

  const showSubs = posItems.subs !== false;
  const isPosVisible = (p) => {
    if (!p) return false;
    return posItems[p] !== false;
  };

  ctx.font = F;
  const sp = ctx.measureText(' ').width;
  let x = PX, line = 0, fresh = true;

  const hasExplicitBreaks = cToks.some(k => k.br);

  for (const k of cToks) {
    ctx.font = F;
    const tw = ctx.measureText(k.t).width;
    const posVisible = showPos && isPosVisible(k.p);
    const bw = Math.max(tw, posVisible ? lw(ctx, k, showSubs) : 0);
    const shouldWrap = preserveLines && k._sourceLine !== undefined
      ? (k._sourceLine > line)
      : (hasExplicitBreaks ? k.br : (k.br || (k.sp && x + sp + bw > W - PX)));
    if (!fresh && shouldWrap) { line++; x = PX; fresh = true; }
    if (!fresh && k.sp) x += sp;
    k.x = x; k.w = bw; k.tx = x + (bw - tw) / 2; k.line = line; x += bw; fresh = false;
    if (!preserveLines) {
      k._sourceLine = line;
    }
  }

  const n = line + 1;
  const cAbove = showClauses
    ? cAn.filter(a => a.k === 'c' && clausesItems[a.v] !== false)
    : [];

  const cBelow = [];
  for (const a of cAn) {
    if (a.k === 'm') {
      if (showParts && partsItems[a.v] !== false) {
        cBelow.push(a);
      }
    } else if (a.k === 'f') {
      if (showTenses) {
        const filteredV = getFilteredVerbFormLabel(a, tensesItems);
        if (filteredV) {
          cBelow.push({ ...a, v: filteredV });
        }
      }
    }
  }

  levels(cAbove);
  levels(cBelow);

  const cSegs = a => {
    const ix = [...a.ix].sort((x, y) => x - y), out = [];
    let c = null;
    const gap = (p, q) => { for (let j = p + 1; j < q; j++) if (cToks[j]?.word) return true; return false; };
    for (const i of ix) {
      const k = cToks[i];
      if (!k) continue;
      if (c && k.line === c.line && !gap(c.e, i)) c.e = i;
      else { c = { s: i, e: i, line: k.line }; out.push(c); }
    }
    return out;
  };

  const cn = Array(n).fill(0), mb = Array(n).fill(0), ph = Array(n).fill(0);
  cAbove.forEach(a => cSegs(a).forEach(s => cn[s.line] = Math.max(cn[s.line], a.l + 1)));
  cBelow.forEach(a => cSegs(a).forEach(s => mb[s.line] = Math.max(mb[s.line], a.l + 1)));
  if (showPos) {
    cToks.forEach(k => {
      if (k.p && isPosVisible(k.p)) {
        const subLines = (showSubs && k.s && k.s.length) ? getSmartSubLines(ctx, k, Math.max(k.w + 14, 52)) : [];
        const reqH = subLines.length > 1 ? (34 + (subLines.length - 1) * 14) : (subLines.length === 1 ? 34 : 18);
        ph[k.line] = Math.max(ph[k.line], reqH);
      }
    });
  }

  const filteredST = (showST && cST && Array.isArray(cST))
    ? cST.filter(item => Boolean(item) && stItems[item] !== false)
    : [];
  const stLab = filteredST.length ? 'Sentence: ' + filteredST.join(' · ') : '';

  let y = TOP + (stLab ? 24 : 0);
  const cLs = [];
  for (let l = 0; l < n; l++) {
    const L = { y, cn: cn[l], ca: cn[l] * CR, p: ph[l], mb: mb[l] };
    L.b = y + L.ca + L.p + 34;
    cLs.push(L);
    y = L.b + (mb[l] ? 12 + mb[l] * MR + 8 : 14);
  }
  const H = Math.max(y + TOP, 70);
  const maxWordRight = cToks.length ? Math.max(...cToks.map(k => k.x + k.w)) : 0;
  const actualW = customPixelRatio ? Math.ceil(Math.max(maxWordRight + PX, 60)) : W;

  targetCv.width = actualW * d;
  targetCv.height = H * d;
  targetCv.style.width = actualW + 'px';
  targetCv.style.maxWidth = '100%';
  targetCv.style.height = H + 'px';
  ctx.setTransform(d, 0, 0, d, 0, 0);

  const isDark = (customPixelRatio == null || customPixelRatio <= 1) && currentTheme === 'dark';
  ctx.fillStyle = isDark ? '#141416' : '#fff';
  ctx.fillRect(0, 0, actualW, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  if (stLab) {
    ctx.font = FB;
    ctx.fillStyle = isDark ? '#d4d4d8' : '#444';
    ctx.fillText(stLab, PX, TOP + 14);
  }

  ctx.font = F;
  ctx.fillStyle = isDark ? '#f4f4f5' : '#111';
  for (const k of cToks) {
    if (cLs[k.line]) ctx.fillText(k.t, k.tx, cLs[k.line].b);
  }

  const isBw = (renderMode === 'bw');
  const isColor = renderMode === 'color_focus' && !isBw;

  if (showPos) {
    ctx.textAlign = 'center';
    for (const k of cToks) {
      if (k.p && isPosVisible(k.p) && cLs[k.line]) {
        const L = cLs[k.line], cx = k.x + k.w / 2, s = showSubs && subs(k), t = L.y + L.ca;
        const posColor = isColor ? getPosColor(k.p, isDark) : (isDark ? '#a1a1aa' : '#444');
        ctx.font = FL;
        ctx.fillStyle = posColor;
        ctx.fillText(PO[k.p] ? PO[k.p][1] : k.p, cx, t + (s ? 13 : 14));
        if (s) {
          ctx.font = FS_;
          ctx.fillStyle = isColor ? posColor : (isDark ? '#71717a' : '#777');
          const subLines = getSmartSubLines(ctx, k, Math.max(k.w + 14, 52));
          for (let li = 0; li < subLines.length; li++) {
            ctx.fillText(subLines[li], cx, t + 27 + li * 13);
          }
        }
      }
    }
  }

  if (showClauses && cAbove.length) {
    renderSmartAbove(ctx, cAbove, cSegs, i => cToks[i], l => cLs[l], null, isDark, isBw);
  }
  if ((showParts || showTenses) && cBelow.length) {
    renderSmartBelow(ctx, cBelow, cSegs, i => cToks[i], l => cLs[l], null, isDark, isBw);
  }
}

/* ---------- AI check (Groq / PositionAPI / Custom OpenAI) ---------- */
const ERR = {
  401: 'Invalid API key.',
  402: 'Insufficient balance on API account.',
  403: 'Access denied: key has no permission for this model or quota exceeded.',
  404: 'Model not found: check model name.',
  429: 'Rate limit reached: please retry shortly.',
  500: 'API provider server error.',
  502: 'Model channel unavailable: retry in a minute.',
  503: 'Service unavailable: retry in a minute.'
};

let currentAiIdeal = null;
let aiGranularity = 'detailed';

function updateAiGranularityButtons() {
  const isDetailed = aiGranularity !== 'macro';
  $('btn-gran-detailed')?.classList.toggle('active', isDetailed);
  $('btn-gran-macro')?.classList.toggle('active', !isDetailed);
}

function setAiGranularity(mode) {
  aiGranularity = mode === 'macro' ? 'macro' : 'detailed';
  updateAiGranularityButtons();
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ foma_ai_granularity: aiGranularity });
  }
  if (currentAiIdeal) {
    if (!currentAiIdeal.detailedAn || !currentAiIdeal.macroAn || areAnnotationsIdentical(currentAiIdeal.detailedAn, currentAiIdeal.macroAn)) {
      const { detailedAn, macroAn } = ensureAiGranularityAn(currentAiIdeal, currentAiIdeal.toks || toks);
      currentAiIdeal.detailedAn = detailedAn;
      currentAiIdeal.macroAn = macroAn;
    }
    currentAiIdeal.an = (aiGranularity === 'macro'
      ? (currentAiIdeal.macroAn || currentAiIdeal.an)
      : (currentAiIdeal.detailedAn || currentAiIdeal.an));
    renderAiCanvas();
    updateAiHeaderInfo();
    if (lastAiVerdict) renderAiVerdictCard(lastAiVerdict);
  }
}

function areAnnotationsIdentical(a1, a2) {
  if (!Array.isArray(a1) || !Array.isArray(a2)) return true;
  const m1 = a1.filter(a => a.k === 'm');
  const m2 = a2.filter(a => a.k === 'm');
  if (m1.length !== m2.length) return false;
  return m1.every(p1 => m2.some(p2 => p2.v === p1.v && p1.ix.length === p2.ix.length && p1.ix.every((x, i) => x === p2.ix[i])));
}

function isModifierToken(idx, aiToks) {
  if (idx < 0 || idx >= aiToks.length) return false;
  const t = aiToks[idx];
  if (!t || !t.word) return false;
  const w = (t.t || '').toLowerCase();
  if (t.p === 'art' || t.p === 'det' || t.p === 'adj' || t.p === 'num') return true;
  if (t.p === 'pron' && (t.s?.includes('pos') || /^(my|your|his|her|its|our|their|whose)$/i.test(w))) return true;
  if (/^(a|an|the|this|that|these|those|each|every|some|any|no|all|both|neither|either|my|your|his|her|its|our|their|such)$/i.test(w)) return true;
  if (w === "'s" || w.endsWith("'s")) return true;
  if (t.p === 'n' && aiToks[idx + 1]?.p === 'n') return true;
  if ((t.p === 'part' || (t.p === 'v' && t.s?.some(x => x.includes('participle')))) && aiToks[idx + 1]?.p === 'n') return true;
  return false;
}

function ensureDetailedBreakdown(parts, aiToks) {
  if (!Array.isArray(parts)) return [];
  const res = [];
  const assigned = new Set();

  const normalizedParts = parts.map(sp => ({
    type: sp.type || sp.part,
    words: Array.isArray(sp.words || sp.ix) ? [...(sp.words || sp.ix)].map(Number).sort((a, b) => a - b) : []
  })).filter(sp => sp.type && sp.words.length > 0);

  normalizedParts.forEach(sp => {
    sp.words.forEach(w => assigned.add(w));
  });

  normalizedParts.forEach(sp => {
    const { type, words } = sp;
    const isNominal = ['Subject', 'Direct object', 'Indirect object', 'Prepositional object', 'Predicative'].includes(type);

    if (!isNominal) {
      res.push(sp);
      return;
    }

    let prepWords = [];
    let innerWords = [...words];

    if (type === 'Prepositional object') {
      const firstTok = aiToks[words[0]];
      if (firstTok && (firstTok.p === 'prep' || /^(in|on|at|by|for|with|without|to|from|about|of|through|into|onto|after|before)$/i.test(firstTok.t))) {
        prepWords.push(words[0]);
        innerWords = words.slice(1);
      } else if (words[0] > 0) {
        const prevIdx = words[0] - 1;
        const prevTok = aiToks[prevIdx];
        if (prevTok && (prevTok.p === 'prep' || /^(in|on|at|by|for|with|without|to|from|about|of|through|into|onto|after|before)$/i.test(prevTok.t))) {
          prepWords.push(prevIdx);
        }
      }
    }

    // Preceding unassigned modifiers (e.g. "A young chubby-chicked" before "lad")
    const leadIdx = innerWords.length > 0 ? innerWords[0] : words[0];
    const leadingMods = [];
    let scanIdx = leadIdx - 1;
    while (scanIdx >= 0 && (!prepWords.length || scanIdx > prepWords[prepWords.length - 1])) {
      if (!assigned.has(scanIdx) && isModifierToken(scanIdx, aiToks)) {
        leadingMods.unshift(scanIdx);
        scanIdx--;
      } else {
        break;
      }
    }

    const modWords = [...leadingMods];
    const headWords = [];
    let foundHead = false;

    for (let i = 0; i < innerWords.length; i++) {
      const wIdx = innerWords[i];
      if (!foundHead && isModifierToken(wIdx, aiToks) && i < innerWords.length - 1) {
        modWords.push(wIdx);
      } else {
        foundHead = true;
        headWords.push(wIdx);
      }
    }

    if (headWords.length === 0 && innerWords.length > 0) {
      headWords.push(...innerWords);
    }

    if (modWords.length > 0) {
      res.push({ type: 'Attribute', words: modWords });
    }

    if (headWords.length > 0 || prepWords.length > 0) {
      res.push({ type, words: [...prepWords, ...headWords].sort((a, b) => a - b) });
    }
  });

  return res;
}

function ensureMacroBreakdown(detailedParts, aiToks) {
  if (!Array.isArray(detailedParts)) return [];

  const cloned = detailedParts.map(p => ({
    type: p.type || p.part,
    words: [...(p.words || p.ix || [])].map(Number).sort((a, b) => a - b)
  })).filter(p => p.type && p.words.length > 0);

  const nominalTypes = ['Subject', 'Direct object', 'Indirect object', 'Prepositional object', 'Predicative'];

  const tokenToPartIndex = new Map();
  cloned.forEach((p, idx) => {
    p.words.forEach(w => tokenToPartIndex.set(w, idx));
  });

  const absorbedIndices = new Set();
  const macroParts = [];

  cloned.forEach((p, idx) => {
    if (!nominalTypes.includes(p.type)) return;

    let minWord = Math.min(...p.words);
    let maxWord = Math.max(...p.words);
    const newWords = new Set(p.words);

    let left = minWord - 1;
    while (left >= 0) {
      const pIdx = tokenToPartIndex.get(left);
      if (pIdx !== undefined && cloned[pIdx].type === 'Attribute') {
        cloned[pIdx].words.forEach(w => newWords.add(w));
        absorbedIndices.add(pIdx);
        left = Math.min(...cloned[pIdx].words) - 1;
      } else if (pIdx === undefined && isModifierToken(left, aiToks)) {
        newWords.add(left);
        left--;
      } else {
        break;
      }
    }

    for (let mid = minWord + 1; mid < maxWord; mid++) {
      const pIdx = tokenToPartIndex.get(mid);
      if (pIdx !== undefined && cloned[pIdx].type === 'Attribute') {
        cloned[pIdx].words.forEach(w => newWords.add(w));
        absorbedIndices.add(pIdx);
      } else if (pIdx === undefined && (isModifierToken(mid, aiToks) || aiToks[mid]?.word)) {
        newWords.add(mid);
      }
    }

    p.words = Array.from(newWords).sort((a, b) => a - b);
  });

  cloned.forEach((p, idx) => {
    if (!absorbedIndices.has(idx)) {
      macroParts.push(p);
    }
  });

  macroParts.sort((a, b) => a.words[0] - b.words[0]);
  return macroParts;
}

function ensureAiGranularityAn(ideal, refToks) {
  if (!ideal) return { detailedAn: [], macroAn: [], activeAn: [] };
  const rawBaseAn = (ideal.an || []).map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f }));
  let detailedAn = ideal.detailedAn ? ideal.detailedAn.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })) : null;
  let macroAn = ideal.macroAn ? ideal.macroAn.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })) : null;

  if (!detailedAn || !macroAn || areAnnotationsIdentical(detailedAn, macroAn)) {
    const baseSource = (detailedAn && detailedAn.some(a => a.k === 'm')) ? detailedAn : rawBaseAn;
    const mParts = baseSource.filter(a => a.k === 'm').map(a => ({ type: a.v, words: [...a.ix] }));
    const nonMParts = baseSource.filter(a => a.k !== 'm');
    const splitDetailedParts = ensureDetailedBreakdown(mParts, refToks);
    const splitMacroParts = ensureMacroBreakdown(splitDetailedParts, refToks);
    detailedAn = [...nonMParts, ...buildSentencePartsAn(splitDetailedParts, refToks)];
    macroAn = [...nonMParts, ...buildSentencePartsAn(splitMacroParts, refToks)];
  }

  const activeAn = (aiGranularity === 'macro' ? macroAn : detailedAn);
  return { detailedAn, macroAn, activeAn };
}

function buildSentencePartsAn(partsList, aiToks) {
  const res = [];
  if (!Array.isArray(partsList)) return res;
  partsList.forEach(sp => {
    const type = sp.type || sp.part;
    const rawWords = sp.words || sp.ix || [];
    const words = Array.isArray(rawWords) ? rawWords.map(Number).filter(w => w >= 0 && w < aiToks.length) : [];
    if (type && words.length) {
      for (let i = res.length - 1; i >= 0; i--) {
        if (res[i].k === 'm' && res[i].ix.some(w => words.includes(w))) {
          res.splice(i, 1);
        }
      }
      res.push({ k: 'm', v: type, ix: [...words] });
    }
  });
  return res;
}

function buildAiState(ideal) {
  if (!ideal) return null;
  const aiToks = toks.map(k => ({ ...k, p: null, s: null }));

  // 1. Parts of Speech (POS) with normalization
  const POS_NORM = {
    noun: 'n', n: 'n',
    pronoun: 'pron', pron: 'pron',
    adjective: 'adj', adj: 'adj',
    numeral: 'num', num: 'num',
    verb: 'v', v: 'v',
    adverb: 'adv', adv: 'adv',
    article: 'art', art: 'art',
    preposition: 'prep', prep: 'prep',
    conjunction: 'conj', conj: 'conj',
    particle: 'part', part: 'part',
    interjection: 'int', int: 'int',
    determiner: 'det', det: 'det'
  };

  if (Array.isArray(ideal.pos)) {
    ideal.pos.forEach(entry => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const [i, rawP, s] = entry;
      const idx = +i;
      if (idx >= 0 && idx < aiToks.length && aiToks[idx]) {
        const normP = rawP ? (POS_NORM[String(rawP).toLowerCase()] || null) : null;
        aiToks[idx].p = normP;
        aiToks[idx].s = Array.isArray(s) ? s : (typeof s === 'string' && s ? [s] : []);
      }
    });
  }

  // Auto-fill any word tokens that the LLM might have omitted using AUTO dictionary
  aiToks.forEach(k => {
    if (k.word && !k.p) {
      const r = AUTO[k.t.toLowerCase()];
      if (r) { k.p = r[0]; k.s = [...r[1]]; }
    }
  });

  const commonAn = [];

  // 2. Clauses and Phrases
  const clauses = ideal.clauses_phrases || ideal.clauses || [];
  const seenClauseAn = new Set();
  if (Array.isArray(clauses)) {
    clauses.forEach(cp => {
      const type = cp.type || cp.clause;
      const rawWords = cp.words || cp.ix || [];
      const words = Array.isArray(rawWords) ? rawWords.map(Number).filter(w => w >= 0 && w < aiToks.length) : [];
      if (type && words.length) {
        const key = `c:${type}:${[...words].sort((a,b)=>a-b).join(',')}`;
        if (!seenClauseAn.has(key)) {
          seenClauseAn.add(key);
          commonAn.push({ k: 'c', v: type, ix: [...words] });
        }
      }
    });
  }

  // 3. Verb Tenses/Forms
  const tenses = ideal.tenses || [];
  const seenTenseTokens = new Set();
  const seenTenseKeys = new Set();
  if (Array.isArray(tenses)) {
    tenses.forEach(t => {
      const rawWords = t.words || t.ix || [];
      const words = Array.isArray(rawWords) ? rawWords.map(Number).filter(w => w >= 0 && w < aiToks.length) : [];
      if (words.length) {
        const formArr = Array.isArray(t.form) ? t.form : [t.tense, t.aspect, t.voice, t.mood].filter(Boolean);
        const formStr = formArr.join(' ');
        const key = `${formStr}:${[...words].sort((a,b)=>a-b).join(',')}`;
        if (!seenTenseKeys.has(key)) {
          seenTenseKeys.add(key);
          const overlapsExisting = words.some(w => seenTenseTokens.has(w));
          if (!overlapsExisting) {
            words.forEach(w => seenTenseTokens.add(w));
            commonAn.push({ k: 'f', v: formStr, ix: [...words], f: formArr });
          }
        }
      }
    });
  }

  // 4. Sentence Parts (Detailed vs Macro)
  const rawDetailedParts = ideal.detailed_sentence_parts || ideal.detailed_parts || ideal.sentence_parts || ideal.parts || [];
  const resolvedDetailedParts = ensureDetailedBreakdown(rawDetailedParts, aiToks);
  const resolvedMacroParts = ensureMacroBreakdown(resolvedDetailedParts, aiToks);

  const detailedPartsAn = buildSentencePartsAn(resolvedDetailedParts, aiToks);
  const macroPartsAn = buildSentencePartsAn(resolvedMacroParts, aiToks);

  const detailedAn = [...commonAn, ...detailedPartsAn];
  const macroAn = [...commonAn, ...macroPartsAn];

  // 5. Sentence Type Classification
  const rawSt = ideal.sentence_type || ideal.sentence_types;
  const aiST = Array.isArray(rawSt) ? rawSt : ['', '', '', ''];

  const activeAn = (aiGranularity === 'macro' ? macroAn : detailedAn);

  return {
    toks: aiToks,
    detailedAn,
    macroAn,
    an: activeAn,
    st: aiST
  };
}

const wtxt = ix => {
  const s = [...ix].sort((a, b) => a - b);
  let o = '', p = null;
  for (const i of s) {
    o += (p === null ? '' : toks.slice(p + 1, i).some(k => k.word) ? ' … ' : ' ') + toks[i].t;
    p = i;
  }
  return o;
};

function describe() {
  const L = [];
  L.push('Words (index "word" = part of speech):');
  toks.forEach((k, i) => {
    if (k.word) L.push(`${i} "${k.t}" = ${k.p ? PO[k.p][0] + (subs(k) ? ' (' + subs(k) + ')' : '') : 'not marked'}`);
  });
  const sec = (t, k) => {
    const a = an.filter(x => x.k === k);
    if (a.length) {
      L.push('', t);
      a.forEach(x => L.push(`${x.v}: "${wtxt(x.ix)}" [${sorted(x).join(',')}]`));
    }
  };
  sec('Sentence parts:', 'm');
  sec('Clauses and phrases:', 'c');
  sec('Tense / voice / mood (of the marked words):', 'f');
  if (ST.some(Boolean)) L.push('', stLabel());
  return L.join('\n');
}

async function apiCall(path, method = 'GET', body = null, targetProv = null) {
  const prov = targetProv || AI.provider || 'positionapi';
  const cfg = PROVIDERS[prov] || PROVIDERS.positionapi;
  const base = prov === 'custom' ? (AI.customUrl || '').replace(/\/+$/, '') : cfg.base;
  const key = AI.keys[prov] || '';

  if (!base) throw new Error('Base URL is not specified.');
  if (prov !== 'custom' && !key) {
    throw new Error(L(`Укажите API-ключ для ${cfg.name}.`, `Please specify an API key for ${cfg.name}.`));
  }

  const headers = {};
  if (key) headers['Authorization'] = 'Bearer ' + key;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    let errMsg = '';
    let failedGen = null;
    try {
      const errJson = await res.json();
      errMsg = errJson.error?.message || errJson.message || '';
      failedGen = errJson.error?.failed_generation;
    } catch (_) {}
    const c = res.status;
    const err = new Error((errMsg || ERR[c] || 'Request failed') + ' (HTTP ' + c + ')');
    if (failedGen) err.failed_generation = failedGen;
    throw err;
  }
  return res.json();
}

async function aiAct(a, i) {
  const g = id => $(id) ? $(id).value : '';

  if (a === 'save') {
    const prov = $('aip')?.value || AI.provider || 'groq';
    AI.provider = prov;
    const k = g('aik').trim();
    if (k) AI.keys[prov] = k;
    if ($('aiurl')) AI.customUrl = g('aiurl').trim();
    if (g('aim')) AI.activeModel[prov] = g('aim').trim();
    if (g('ail')) AI.lang = g('ail');
    chrome.storage?.local?.set({
      aiprovider: AI.provider,
      aikeys: AI.keys,
      aicustomurl: AI.customUrl,
      aiactivemodels: AI.activeModel,
      ailang: AI.lang
    });
    msg(L('Настройки сохранены для ' + (PROVIDERS[prov]?.name || prov) + '.', 'Settings saved for ' + prov + '.'));
    ui();
  } else if (a === 'rm') {
    const prov = AI.provider || 'groq';
    AI.keys[prov] = '';
    chrome.storage?.local?.set({ aikeys: AI.keys });
    msg(L('Ключ удалён.', 'API key removed.'));
    ui();
  } else if (a === 'models') {
    const prov = $('aip')?.value || AI.provider || 'groq';
    AI.provider = prov;
    const k = g('aik').trim();
    if (k) AI.keys[prov] = k;
    if ($('aiurl')) AI.customUrl = g('aiurl').trim();
    try {
      msg(L('Загрузка моделей…', 'Loading models…'));
      const data = await apiCall('/models');
      let list = (data.data || []).map(m => m.id);
      if (prov === 'groq') {
        list = list.filter(id => !id.includes('whisper'));
      }
      list.sort();
      if (list.length) {
        AI.models[prov] = list;
        chrome.storage?.local?.set({ aimodels: AI.models });
        msg(L(`Загружено моделей: ${list.length}.`, `${list.length} models loaded.`));
      } else {
        msg(L('Список моделей пуст.', 'Model list is empty.'));
      }
      ui();
    } catch (err) {
      msg(L('Ошибка загрузки моделей: ', 'Error: ') + err.message);
    }
  } else if (a === 'run') {
    if (!toks.some(k => k.word)) return msg(L('Нет предложения для разбора.', 'No sentence to check.'));
    const prov = $('aip')?.value || AI.provider || 'groq';
    AI.provider = prov;
    const k = g('aik').trim();
    if (k) AI.keys[prov] = k;
    if ($('aiurl')) AI.customUrl = g('aiurl').trim();
    if (g('aim')) AI.activeModel[prov] = g('aim').trim();
    if (g('ail')) AI.lang = g('ail');

    const curKey = AI.keys[prov];
    if (prov !== 'custom' && !curKey) {
      AIR = `<div class="note">${L('Добавьте API-ключ выше для запуска проверки.', 'Add your API key above first.')}</div>`;
      showAiError(L(`Для работы с ${PROVIDERS[prov]?.name || prov} укажите API-ключ в настройках.`, `Please specify an API key for ${PROVIDERS[prov]?.name || prov}.`), true);
      return ui();
    }

    AIR = `<div class="note" style="display:flex;align-items:center;gap:8px;">${L('ИИ выполняет полный синтаксический разбор и поиск ошибок…', 'Checking parse and building schema with AI…')}</div>`;
    ui();

    const sys = sysPromptForAi();

    try {
      const t0 = Date.now();
      const selectedModel = AI.activeModel[prov] || PROVIDERS[prov]?.defaultModel;
      const candidateModels = prov === 'groq'
        ? [selectedModel, ...PROVIDERS.groq.models.filter(m => m !== selectedModel)]
        : [selectedModel];

      let res = null;
      let usedModel = selectedModel;
      let lastErr = null;

      for (const m of candidateModels) {
        usedModel = m;
        const isReasoning = prov === 'groq' || /oss|o1|o3|r1|reason/i.test(m);
        const payload = {
          model: m,
          temperature: 0.1,
          max_tokens: 8192,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: 'Sentence: ' + ta.value + '\n\n' + describe() }
          ]
        };
        if (isReasoning && prov === 'groq') {
          payload.reasoning_effort = 'low';
        }

        try {
          res = await apiCall('/chat/completions', 'POST', payload);
          if (res) break;
        } catch (e) {
          lastErr = e;
          // If Groq rejected due to JSON validator, check if it supplied failed_generation
          if (e.failed_generation) {
            const fg = String(e.failed_generation).trim();
            const s1 = fg.indexOf('{'), e1 = fg.lastIndexOf('}');
            if (s1 >= 0 && e1 > s1) {
              try {
                const parsed = JSON.parse(fg.slice(s1, e1 + 1));
                if (parsed && (parsed.ideal_parse || parsed.verdict)) {
                  res = { choices: [{ message: { content: fg.slice(s1, e1 + 1) } }] };
                  break;
                }
              } catch (_) {}
            }
          }

          // If Groq failed on this model (HTTP 400 bad JSON, 404 decommissioned, 429 rate limit, 503), cascade to next candidate model!
          if (prov === 'groq' && candidateModels.indexOf(m) < candidateModels.length - 1) {
            console.warn(`[FOMA Parser] Groq model ${m} failed:`, e.message, 'Cascading to next model...');
            continue;
          }
          throw e;
        }
      }

      if (!res) throw (lastErr || new Error('No models responded.'));

      if (usedModel !== AI.activeModel[prov]) {
        AI.activeModel[prov] = usedModel;
        chrome.storage?.local?.set({ aiactivemodels: AI.activeModel });
        if ($('aim')) $('aim').value = usedModel;
      }

      const msgObj = res.choices && res.choices[0] && res.choices[0].message;
      const raw = ((msgObj?.content || msgObj?.reasoning_content || msgObj?.reasoning || '')).trim();
      const st = raw.indexOf('{'), en = raw.lastIndexOf('}');
      let r;
      try {
        r = JSON.parse(raw.slice(st, en + 1));
      } catch (_) {
        r = { verdict: 'incomplete', summary: raw.slice(0, 600), issues: [] };
      }

      AII = r.issues || [];
      currentAiIdeal = buildAiState(r.ideal_parse);
      const latencySec = ((Date.now() - t0) / 1000).toFixed(1);
      lastAiFilledText = ta.value.trim();
      lastAiFilledModel = usedModel;
      lastAiFilledLatency = latencySec;
      lastAiVerdict = r;
      saveCurrentToHistory(false);

      // Update AI View elements
      renderAiCanvas();
      updateAiHeaderInfo();
      renderAiVerdictCard(r);

      const vClass = r.verdict === 'correct' ? 'color:#10b981;' : r.verdict === 'has_errors' ? 'color:#ef4444;' : 'color:#f59e0b;';
      const vTitle = r.verdict === 'correct' 
        ? L('Разбор верен', 'Looks correct') 
        : r.verdict === 'has_errors' 
          ? L('Обнаружены ошибки', 'Has errors') 
          : L('Разбор неполон', 'Incomplete');

      let out = '';
      if (currentAiIdeal) {
        out += `
          <div class="ai-scheme-box" style="margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:14px;background:#fafafc;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
              <span style="font-weight:700;font-size:14px;color:var(--ink);">${L('Эталонная схема разбора от ИИ:', 'Ideal parse diagram by AI:')}</span>
              <div style="display:flex;gap:8px;">
                <button id="btn-apply-ai" class="btn-hist-load" title="${L('Применить разбор ИИ на основном холсте', 'Apply AI parse to main canvas')}">${L('Применить этот разбор', 'Apply this parse')}</button>
                <button id="btn-copy-ai-img" class="btn-hist-sec" title="${L('Скопировать изображение разбора ИИ', 'Copy AI parse image')}">${L('Копировать картинку ИИ', 'Copy AI image')}</button>
              </div>
            </div>
            <div class="paper" id="ai-wrap" style="overflow-x:hidden;overflow-y:auto;background:#fff;border-radius:8px;border:1px solid var(--line);padding:8px 0;">
              <canvas id="ai-cv"></canvas>
            </div>
          </div>
        `;
      }

      out += `
        <div style="margin-top:14px;padding:14px;border-radius:10px;background:#fff;border:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
            <div style="font-size:15px;font-weight:700;${vClass}">${vTitle}</div>
            <div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:3px 8px;border-radius:12px;">${latencySec} ${L('сек', 's')} · ${esc(usedModel)}</div>
          </div>
          <div style="font-size:13px;line-height:1.5;color:#334155;margin-bottom:12px;">${esc(r.summary)}</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${AII.length === 0 ? `<div style="color:#059669;font-size:13px;">${L('Замечаний нет — все члены предложения и части речи расставлены безупречно!', 'No errors found — your parse matches the sentence perfectly!')}</div>` : ''}
            ${AII.map((x, n) => {
              const wordsStr = (x.words || []).map(w => toks[w] ? toks[w].t : w).join(' ') || L('всё предложение', 'whole sentence');
              const isErr = x.severity === 'error';
              return `
                <div style="border:1px solid ${isErr ? '#fecaca' : '#fed7aa'};background:${isErr ? '#fff5f5' : '#fffaf0'};border-radius:6px;padding:8px 12px;font-size:13px;line-height:1.4;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <button data-ai="iss" data-i="${n}" class="btn-hist-sec" style="font-weight:700;background:#fff;cursor:pointer;" title="${L('Выделить эти слова на основном холсте', 'Highlight words on main canvas')}">${esc(wordsStr)}</button>
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${isErr ? '#dc2626' : '#d97706'};">${esc(x.severity)}</span>
                  </div>
                  <div style="color:#1e293b;">${esc(x.problem)}</div>
                  ${x.suggestion ? `<div style="color:#059669;font-weight:500;margin-top:3px;">→ ${esc(x.suggestion)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      AIR = out;
      ui();

      // Render the AI diagram on #ai-cv after DOM update
      if (currentAiIdeal) {
        setTimeout(() => {
          const aiCv = $('ai-cv');
          if (aiCv) renderCustomSchema(aiCv, currentAiIdeal.toks, currentAiIdeal.an, currentAiIdeal.st, +$('sc')?.value || 70);
        }, 30);
      }
    } catch (err) {
      AIR = `<div class="note" style="color:#ef4444;">${L('Ошибка проверки ИИ: ', 'AI check error: ')}${esc(err.message)}</div>`;
      showAiError(err.message);
      ui();
    }
  } else if (a === 'iss') {
    const x = AII[+i];
    if (x && x.words) {
      sel = x.words.filter(w => toks[w] && toks[w].word);
      anc = sel[0];
      last = sel[sel.length - 1];
      selChanged();
      window.scrollTo({ top: $('wrap').offsetTop - 20, behavior: 'smooth' });
    }
  }
}

/* ---------- Direct AI Master Grammar Prompt ---------- */
function sysPromptForAiDirectFill() {
  return 'You are an authoritative linguistic parser and expert in English syntax according to the academic Russian grammatical tradition (Barkhudarov, Kaushanskaya, Smirnitsky).\n' +
    'Task: Completely and accurately parse the given English sentence.\n' +
    'Do NOT critique student work. Directly analyze the sentence itself.\n\n' +
    'CRITICAL SYNTAX RULES (Russian academic tradition):\n' +
    '1. Detailed Analytical Parsing (sentence_parts):\n' +
    '   - Simple Subject and Objects must NEVER include their modifying attributes, determiners, articles, or adjectives!\n' +
    '   - Subject: ONLY the nuclear head noun or pronoun alone (e.g. ONLY "lad", not "A young chubby-cheeked lad").\n' +
    '   - Attribute: All modifying articles, determiners, adjectives, numerals, and possessive pronouns modifying a noun MUST be explicitly marked as "Attribute" (e.g. "A young" -> Attribute; "his" -> Attribute; "the parish" -> Attribute). Every modifying word before a noun MUST be tagged as Attribute!\n' +
    '   - Direct object / Indirect object: strictly the head noun or pronoun alone (e.g. "hat" -> Direct object; "his" -> Attribute).\n' +
    '   - Predicative: strictly the predicate noun/adjective head alone (e.g. "sense" -> Predicative; "common" -> Attribute).\n' +
    '   - Prepositional object: preposition + head noun, with any modifying attributes inside separated as "Attribute".\n' +
    '   - Adverbial modifiers (AdvM place/time/manner/degree/etc.): include the whole adverbial phrase.\n\n' +
    'You MUST return ONLY a single valid JSON object matching this structure (no markdown fences, no text outside JSON):\n' +
    '{\n' +
    '  "summary": "1-2 sentences in Russian summarizing the grammatical structure of the sentence (e.g. Сложноподчинённое предложение...)",\n' +
    '  "ideal_parse": {\n' +
    '    "sentence_type": ["Structure", "Purpose", "Question_type", "Polarity"],\n' +
    '    "clauses_phrases": [\n' +
    '      {"type": "Main clause"|"Coordinate clause"|"Subject clause"|"Predicative clause"|"Object clause"|"Attributive clause (defining)"|"Attributive clause (non-defining)"|"AdvCl time"|"AdvCl place"|"AdvCl cause"|"AdvCl purpose"|"AdvCl condition"|"AdvCl concession"|"AdvCl manner"|"AdvCl result"|"AdvCl comparison"|"Prepositional phrase"|"Infinitive phrase"|"Gerund phrase"|"Participial phrase"|"Absolute construction"|"Complex object"|"Complex subject"|"Noun phrase"|"Verb phrase", "words": [token_indices]}\n' +
    '    ],\n' +
    '    "sentence_parts": [\n' +
    '      {"type": "Subject"|"Predicate"|"Predicative"|"Direct object"|"Indirect object"|"Prepositional object"|"Attribute"|"Apposition"|"AdvM manner"|"AdvM place"|"AdvM time"|"AdvM frequency"|"AdvM degree"|"AdvM cause"|"AdvM purpose"|"AdvM condition"|"AdvM concession"|"Introductory element"|"Address", "words": [token_indices]}\n' +
    '    ],\n' +
    '    "tenses": [\n' +
    '      {"words": [predicate_indices], "form": ["Tense", "Aspect", "Voice", "Mood"]}\n' +
    '    ],\n' +
    '    "pos": [\n' +
    '      [token_index, "pos_code"]\n' +
    '    ]\n' +
    '  }\n' +
    '}\n\n' +
    'POS codes: n (noun), pron (pronoun), adj (adjective), num (numeral), v (verb), adv (adverb), art (article), prep (preposition), conj (conjunction), part (particle), int (interjection), det (determiner).\n' +
    'Token indices are 0-based based on the exact word list provided by the user. Every word token must have a POS.';
}

function sysPromptForAi() {
  return 'You are an authoritative linguistic parser and expert in English syntax according to the academic Russian grammatical tradition (Barkhudarov, Kaushanskaya, Smirnitsky).\n' +
    'Task: Evaluate the student\'s parse of the given English sentence, report issues, and provide an authoritative ideal parse.\n' +
    'CRITICAL SYNTAX RULES:\n' +
    '- Detailed Analytical Parsing: Simple Subject and Objects must NEVER include their modifying attributes or articles! Subject is ONLY the nuclear head noun/pronoun. Modifiers before/after nouns MUST be tagged as Attribute.\n\n' +
    'You MUST return ONLY a single valid JSON object matching this structure (no markdown fences, no text outside JSON):\n' +
    '{\n' +
    '  "verdict": "correct" | "has_errors" | "incomplete",\n' +
    '  "summary": "1-2 sentences in Russian summarizing the verdict and grammatical structure",\n' +
    '  "issues": [\n' +
    '    {"words": [token_indices], "severity": "error"|"warning"|"tip", "problem": "explanation in Russian", "suggestion": "suggestion in Russian"}\n' +
    '  ],\n' +
    '  "ideal_parse": {\n' +
    '    "sentence_type": ["Structure", "Purpose", "Question_type", "Polarity"],\n' +
    '    "clauses_phrases": [\n' +
    '      {"type": "Clause/Phrase Type", "words": [token_indices]}\n' +
    '    ],\n' +
    '    "sentence_parts": [\n' +
    '      {"type": "Subject"|"Predicate"|"Predicative"|"Direct object"|"Indirect object"|"Prepositional object"|"Attribute"|"Apposition"|"AdvM manner"|"AdvM place"|"AdvM time"|"AdvM frequency"|"AdvM degree"|"AdvM cause"|"AdvM purpose"|"AdvM condition"|"AdvM concession"|"Introductory element"|"Address", "words": [token_indices]}\n' +
    '    ],\n' +
    '    "tenses": [\n' +
    '      {"words": [predicate_indices], "form": ["Tense", "Aspect", "Voice", "Mood"]}\n' +
    '    ],\n' +
    '    "pos": [\n' +
    '      [token_index, "pos_code"]\n' +
    '    ]\n' +
    '  }\n' +
    '}\n\n' +
    'POS codes: n, pron, adj, num, v, adv, art, prep, conj, part, int, det.\n' +
    'Token indices are 0-based based on the exact word list provided by the user.';
}

function parseAiResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find first { and last }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;

  let candidate = text.slice(s, e + 1);

  // 1. Direct JSON.parse
  try {
    const obj = JSON.parse(candidate);
    if (obj && (obj.ideal_parse || obj.pos || obj.sentence_parts || obj.detailed_sentence_parts)) return obj;
  } catch (_) {}

  // 2. Strip trailing commas
  try {
    const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
    const obj = JSON.parse(cleaned);
    if (obj && (obj.ideal_parse || obj.pos || obj.sentence_parts || obj.detailed_sentence_parts)) return obj;
  } catch (_) {}

  // 3. Extract ideal_parse block by brace balance
  try {
    const idealIdx = candidate.indexOf('"ideal_parse"');
    if (idealIdx >= 0) {
      let braceCount = 0;
      let idealStart = -1;
      let idealEnd = -1;
      for (let i = idealIdx; i < candidate.length; i++) {
        if (candidate[i] === '{') {
          if (braceCount === 0) idealStart = i;
          braceCount++;
        } else if (candidate[i] === '}') {
          braceCount--;
          if (braceCount === 0 && idealStart >= 0) {
            idealEnd = i;
            break;
          }
        }
      }
      if (idealStart >= 0 && idealEnd > idealStart) {
        const idealStr = candidate.slice(idealStart, idealEnd + 1).replace(/,\s*([}\]])/g, '$1');
        const idealParsed = JSON.parse(idealStr);
        let summaryMatch = candidate.match(/"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
        return {
          summary: summaryMatch ? summaryMatch[1] : 'Полный синтаксический разбор сформирован моделью.',
          ideal_parse: idealParsed
        };
      }
    }
  } catch (_) {}

  // 4. Bracket auto-closing if response truncated
  try {
    let unclosed = candidate.replace(/,\s*$/, '');
    let openBrackets = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < unclosed.length; i++) {
      const ch = unclosed[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '{' || ch === '[') openBrackets.push(ch);
        else if (ch === '}' && openBrackets[openBrackets.length - 1] === '{') openBrackets.pop();
        else if (ch === ']' && openBrackets[openBrackets.length - 1] === '[') openBrackets.pop();
      }
    }
    if (inString) unclosed += '"';
    unclosed = unclosed.replace(/,\s*$/, '');
    while (openBrackets.length) {
      const b = openBrackets.pop();
      unclosed += b === '{' ? '}' : ']';
    }
    const obj = JSON.parse(unclosed.replace(/,\s*([}\]])/g, '$1'));
    if (obj) return obj;
  } catch (_) {}

  return null;
}

/* ---------- Top Modes Navigation & AI Filled View Controller ---------- */
function switchTopMode(mode) {
  currentTopMode = mode;
  const isAi = mode === 'ai';

  $('tab-nav-manual')?.classList.toggle('active', !isAi);
  $('tab-nav-ai')?.classList.toggle('active', isAi);

  const aiTopControls = $('ai-top-controls');
  const aiTopActions = $('ai-top-actions');
  if (aiTopControls) aiTopControls.style.display = isAi ? 'inline-flex' : 'none';
  if (aiTopActions) aiTopActions.style.display = isAi ? 'inline-flex' : 'none';

  const viewManual = $('view-manual');
  const viewAi = $('view-ai');
  if (viewManual) viewManual.style.display = isAi ? 'none' : 'block';
  if (viewAi) viewAi.style.display = isAi ? 'block' : 'none';

  const tabs = $('tabs');
  const pane = $('pane');
  if (tabs) tabs.style.display = isAi ? 'none' : 'flex';
  if (pane) pane.style.display = isAi ? 'none' : 'block';

  if (isAi) {
    onEnterAiMode();
  } else {
    render();
    ui();
  }
}

function onEnterAiMode() {
  syncAiSelectors();
  const currentText = (ta?.value || '').trim();
  if (!currentText) {
    showAiError(L('Введите или вставьте предложение для разбора.', 'Enter or paste a sentence to parse.'));
    return;
  }

  const curKey = normalizeHistoryText(currentText);

  // 1. If already filled in memory for this exact normalized text, display immediately
  if (currentAiIdeal && normalizeHistoryText(lastAiFilledText) === curKey) {
    renderAiCanvas();
    updateAiHeaderInfo();
    if (lastAiVerdict) renderAiVerdictCard(lastAiVerdict);
    return;
  }

  // 2. Check if this exact text has a cached AI parse in history
  const cached = historyCache.find(x => x && normalizeHistoryText(x.text) === curKey && x.aiIdeal);
  if (cached) {
    const cachedIdeal = cached.aiIdeal;
    const { detailedAn, macroAn, activeAn } = ensureAiGranularityAn(cachedIdeal, cToks);

    currentAiIdeal = {
      toks: cToks,
      detailedAn,
      macroAn,
      an: activeAn,
      st: [...(cachedIdeal.st || [])]
    };
    lastAiFilledText = cached.text || currentText;
    lastAiFilledModel = cached.aiModel || '';
    lastAiFilledLatency = cached.aiLatency || null;
    lastAiVerdict = cached.aiVerdict || null;
    if (cached.settings) {
      applySentenceSettings(cached.settings);
    }
    renderAiCanvas();
    updateAiHeaderInfo();
    if (lastAiVerdict) renderAiVerdictCard(lastAiVerdict);
    msg(L('Разбор от ИИ загружен из кэша (0 токенов)', 'AI parse loaded from cache (0 tokens)'));
    return;
  }

  // 3. Otherwise, automatically launch AI direct filling process!
  runAiDirectFill();
}

function syncAiSelectors() {
  const provSel = $('sel-ai-provider');
  const modelSel = $('sel-ai-model');
  if (!provSel || !modelSel) return;

  const prov = AI.provider || 'positionapi';
  provSel.value = prov;

  const models = AI.models[prov] || PROVIDERS[prov]?.models || [];
  const curModel = AI.activeModel[prov] || PROVIDERS[prov]?.defaultModel || models[0] || '';

  modelSel.innerHTML = models.map(m => `<option value="${esc(m)}"${m === curModel ? ' selected' : ''}>${esc(m)}</option>`).join('');

  updateAiKeyInlineBar();
}

function updateAiKeyInlineBar() {
  const prov = AI.provider || 'positionapi';
  const hasKey = prov === 'custom' ? true : !!(AI.keys[prov] && AI.keys[prov].trim());
  const bar = $('ai-key-inline-bar');
  const label = $('ai-key-prompt-label');
  const badge = $('ai-key-badge-status');

  if (prov === 'custom') {
    if (bar) bar.style.display = 'none';
    if (badge) badge.innerHTML = `<span class="dot-online"></span> <span style="color:#64748b;">Custom URL: ${esc(AI.customUrl)}</span>`;
  } else if (!hasKey) {
    if (bar) {
      if (label) {
        label.textContent = L(`API-ключ для ${PROVIDERS[prov]?.name || prov}:`, `API key for ${PROVIDERS[prov]?.name || prov}:`);
      }
      const inp = $('ai-key-inline-input');
      if (inp) inp.placeholder = PROVIDERS[prov]?.keyPlaceholder || 'sk-…';
    }
    if (badge) badge.innerHTML = `<span class="dot-offline"></span> <span style="color:#ef4444;font-weight:600;">Ключ не настроен</span>`;
  } else {
    if (bar) bar.style.display = 'none';
    if (badge) {
      badge.innerHTML = `<span class="dot-online"></span> <span style="color:#16a34a;font-weight:600;">Ключ настроен</span>`;
    }
  }

  const dot = $('ai-combo-status-dot');
  if (dot) {
    dot.className = hasKey ? 'dot-online' : 'dot-offline';
    dot.title = hasKey ? L('API-ключ настроен', 'API key configured') : L('API-ключ не настроен', 'API key missing');
  }
}

function showAiLoading(modelName = null, providerName = null) {
  const loading = $('ai-loading-state');
  const wrapAi = $('wrap-ai');
  const errorBox = $('ai-error-state');
  const card = $('ai-verdict-card');

  if (loading) loading.style.display = 'flex';
  if (wrapAi) wrapAi.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';
  if (card) card.style.display = 'none';

  const prov = providerName || AI.provider || 'positionapi';
  const m = modelName || AI.activeModel[prov] || PROVIDERS[prov]?.defaultModel || '';
  const pName = PROVIDERS[prov]?.name || prov;
  const loadingModelInfo = $('ai-loading-model-info');
  if (loadingModelInfo) {
    loadingModelInfo.textContent = L(`Отправка запроса к модели ${m} (${pName})…`, `Sending request to model ${m} (${pName})…`);
  }
}

function showAiError(message, isKeyMissing = false) {
  const loading = $('ai-loading-state');
  const wrapAi = $('wrap-ai');
  const errorBox = $('ai-error-state');
  const errMsg = $('ai-error-message');

  if (loading) loading.style.display = 'none';
  if (wrapAi) wrapAi.style.display = 'none';
  if (errorBox) errorBox.style.display = 'block';

  if (errMsg) {
    errMsg.innerHTML = esc(message);
  }
  if (isKeyMissing) {
    updateAiKeyInlineBar();
  }
}

async function runAiDirectFill(forcedProv = null, forcedModel = null) {
  if (isAiFilling) return;
  const currentText = (ta?.value || '').trim();
  if (!currentText) {
    showAiError(L('Введите или вставьте предложение для разбора.', 'Enter or paste a sentence to parse.'));
    return;
  }

  const prov = forcedProv || $('sel-ai-provider')?.value || AI.provider || 'positionapi';
  AI.provider = prov;
  const selModel = forcedModel || $('sel-ai-model')?.value || AI.activeModel[prov] || PROVIDERS[prov]?.defaultModel;
  AI.activeModel[prov] = selModel;

  chrome.storage?.local?.set({
    aiprovider: AI.provider,
    aiactivemodels: AI.activeModel
  });

  const key = AI.keys[prov] || '';
  if (prov !== 'custom' && !key) {
    updateAiKeyInlineBar();
    showAiError(L(`Укажите API-ключ для ${PROVIDERS[prov]?.name || prov}.`, `Please specify an API key for ${PROVIDERS[prov]?.name || prov}.`), true);
    return;
  }

  isAiFilling = true;
  showAiLoading(selModel, prov);

  const t0 = Date.now();
  try {
    const sysPrompt = sysPromptForAiDirectFill();
    const indexedWords = toks.map((k, i) => `${i}: "${k.t}"${k.word ? '' : ' (punctuation)'}`).join('\n');
    const userPrompt = `Parse this English sentence:\n"${currentText}"\n\nWord tokens with exact 0-based indices:\n${indexedWords}`;

    const isReasoning = prov === 'groq' || /oss|o1|o3|r1|reason/i.test(selModel);
    const payload = {
      model: selModel,
      temperature: 0.1,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    if (isReasoning && prov === 'groq') {
      payload.reasoning_effort = 'low';
    }

    const res = await apiCall('/chat/completions', 'POST', payload, prov);
    const msgObj = res.choices && res.choices[0] && res.choices[0].message;
    const raw = (msgObj?.content || msgObj?.reasoning_content || msgObj?.reasoning || '').trim();

    const parsed = parseAiResponse(raw);
    const idealData = parsed?.ideal_parse || (parsed?.pos ? parsed : null);
    if (!idealData) {
      console.warn('[FOMA Parser] Raw AI response:', raw);
      throw new Error(L('Модель вернула некорректный ответ. Попробуйте повторить или сменить модель.', 'Model returned invalid response. Try again or change model.'));
    }

    currentAiIdeal = buildAiState(idealData);
    if (!currentAiIdeal) {
      throw new Error(L('Не удалось сформировать схему разбора.', 'Failed to build parse schema.'));
    }

    const latencySec = ((Date.now() - t0) / 1000).toFixed(1);
    lastAiFilledText = currentText;
    lastAiFilledModel = selModel;
    lastAiFilledLatency = latencySec;
    lastAiVerdict = parsed;
    saveCurrentToHistory(false);

    renderAiCanvas();
    updateAiHeaderInfo();
    renderAiVerdictCard(parsed);
  } catch (err) {
    showAiError(err.message, err.message.includes('API-ключ'));
  } finally {
    isAiFilling = false;
  }
}

function renderAiCanvas() {
  const loading = $('ai-loading-state');
  const errorBox = $('ai-error-state');
  const wrapAi = $('wrap-ai');
  const cvAi = $('cv-ai');

  if (loading) loading.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';
  if (wrapAi) wrapAi.style.display = 'block';

  if (!cvAi || !currentAiIdeal) return;
  const sc = +$('sc')?.value || 70;
  renderCustomSchema(cvAi, currentAiIdeal.toks, currentAiIdeal.an, currentAiIdeal.st, sc, null, aiLayers);

  const prev = $('ai-sentence-text');
  if (prev) prev.textContent = (ta?.value || '').trim();
}

function setFullHeight(enable) {
  isFullHeight = !!enable;
  const wrap = $('wrap');
  const wrapAi = $('wrap-ai');
  const containerMan = $('canvas-with-sidebar');
  if (wrap) wrap.classList.toggle('is-full-height', isFullHeight);
  if (wrapAi) wrapAi.classList.toggle('is-full-height', isFullHeight);
  if (containerMan) containerMan.classList.toggle('is-full-height', isFullHeight);

  const btnAi = $('btn-ai-toggle-height');
  if (btnAi) {
    btnAi.classList.toggle('on', isFullHeight);
    const span = btnAi.querySelector('span');
    if (span) {
      span.textContent = isFullHeight ? L('Свернуть', 'Collapse') : L('На всю высоту', 'Full height');
    } else {
      btnAi.innerHTML = isFullHeight ? L('Свернуть', 'Collapse') : L('На всю высоту', 'Full height');
    }
    btnAi.title = isFullHeight 
      ? L('Вернуть стандартную высоту со скроллом', 'Restore standard scroll height') 
      : L('Развернуть на всю высоту разбора без внутреннего скролла', 'Expand to full parse height without scroll');
  }

  const btnMan = $('btn-manual-toggle-height');
  if (btnMan) {
    btnMan.classList.toggle('on', isFullHeight);
    btnMan.innerHTML = isFullHeight ? L('Свернуть', 'Collapse') : L('На всю высоту', 'Full height');
    btnMan.title = isFullHeight 
      ? L('Вернуть стандартную высоту со скроллом', 'Restore standard scroll height') 
      : L('Развернуть на всю высоту разбора без внутреннего скролла', 'Expand to full parse height without scroll');
  }

  chrome.storage?.local?.set({ foma_is_full_height: isFullHeight });
  saveCurrentToHistory(false);
}

let activeLayerPopoverId = null;
let layerPopoversGlobalEventsSetup = false;

function closeAllLayerPopovers() {
  document.querySelectorAll('.ai-layer-popover').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.ai-filter-pill-toggle').forEach(b => {
    b.classList.remove('open');
    b.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.ai-filter-pill').forEach(p => p.classList.remove('popover-open'));
  activeLayerPopoverId = null;
}

function toggleLayerPopover(layerId) {
  const popover = $('ai-popover-' + layerId);
  const toggleBtn = $('ai-toggle-' + layerId);
  const pill = $('ai-pill-' + layerId);
  if (!popover || !toggleBtn) return;

  const isOpen = popover.style.display !== 'none';
  closeAllLayerPopovers();

  if (!isOpen) {
    popover.style.display = 'flex';
    toggleBtn.classList.add('open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    pill?.classList.add('popover-open');
    activeLayerPopoverId = layerId;
    const searchInput = popover.querySelector('.ai-popover-search');
    if (searchInput) {
      searchInput.value = '';
      filterPopoverItems(layerId, '');
      setTimeout(() => searchInput.focus(), 50);
    }
  }
}

function filterPopoverItems(layerId, query) {
  const popover = $('ai-popover-' + layerId);
  if (!popover) return;
  const q = (query || '').trim().toLowerCase();
  const items = popover.querySelectorAll('.ai-popover-item');
  let visibleCount = 0;

  items.forEach(item => {
    const searchData = item.getAttribute('data-search') || '';
    const match = !q || searchData.includes(q);
    item.style.display = match ? 'flex' : 'none';
    if (match) visibleCount++;
  });

  popover.querySelectorAll('.ai-popover-group').forEach(group => {
    const groupItems = group.querySelectorAll('.ai-popover-item');
    const anyVisible = Array.from(groupItems).some(it => it.style.display !== 'none');
    group.style.display = anyVisible ? 'block' : 'none';
  });

  let emptyMsg = popover.querySelector('.ai-popover-empty');
  if (visibleCount === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.className = 'ai-popover-empty';
      emptyMsg.textContent = L('Ничего не найдено', 'No items found');
      popover.querySelector('.ai-popover-body')?.appendChild(emptyMsg);
    }
    emptyMsg.style.display = 'block';
  } else if (emptyMsg) {
    emptyMsg.style.display = 'none';
  }
}

function updateLayerPillBadge(layerId) {
  const cfg = LAYER_CONFIGS[layerId];
  if (!cfg) return;
  ensureLayerItems(aiLayers);
  const itemsMap = aiLayers[cfg.itemsKey] || cfg.defaults;
  let total = 0;
  let active = 0;

  cfg.groups.forEach(g => {
    g.items.forEach(it => {
      total++;
      if (itemsMap[it.key] !== false) active++;
    });
  });

  const badge = $('ai-badge-' + layerId);
  if (badge) {
    badge.textContent = `${active}/${total}`;
    badge.classList.toggle('filtered', active < total);
    badge.title = active < total
      ? L(`Активно: ${active} из ${total} (часть скрыта фильтром)`, `Active: ${active} of ${total} (partially filtered)`)
      : L(`Все параметры включены (${total}/${total})`, `All parameters enabled (${total}/${total})`);
  }

  const pill = $('ai-pill-' + layerId);
  const chip = $('ai-chip-' + layerId);
  const mainCb = $('ai-layer-' + layerId);
  if (mainCb) {
    if (pill) pill.classList.toggle('active', mainCb.checked);
    if (chip) chip.classList.toggle('active', mainCb.checked);
  }
}

function updateAllLayerPillBadges() {
  ['pos', 'parts', 'clauses', 'tenses', 'st'].forEach(layerId => {
    updateLayerPillBadge(layerId);
    const chip = $('ai-chip-' + layerId);
    const cb = $('ai-layer-' + layerId);
    if (chip && cb) {
      chip.classList.toggle('active', cb.checked);
    }
  });
}

function ensureLayerVisible(layerId) {
  if (aiLayers && aiLayers[layerId] === false) {
    aiLayers[layerId] = true;
    const cb = $('ai-layer-' + layerId);
    if (cb) cb.checked = true;
    const pill = $('ai-pill-' + layerId);
    if (pill) pill.classList.add('active');
    updateLayerPillBadge(layerId);
    chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  }
}

function ensureLayerItemVisible(layerId, itemKey) {
  ensureLayerVisible(layerId);
  const cfg = LAYER_CONFIGS[layerId];
  if (cfg && aiLayers[cfg.itemsKey] && aiLayers[cfg.itemsKey][itemKey] === false) {
    aiLayers[cfg.itemsKey][itemKey] = true;
    const popover = $('ai-popover-' + layerId);
    if (popover) {
      const cb = popover.querySelector(`input[data-layer="${layerId}"][data-key="${itemKey}"]`);
      if (cb) cb.checked = true;
    }
    updateLayerPillBadge(layerId);
    chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  }
}

function toggleAiLayer(layerId) {
  const cb = $('ai-layer-' + layerId);
  if (!cb) return;
  cb.checked = !cb.checked;
  aiLayers[layerId] = cb.checked;
  const chip = $('ai-chip-' + layerId);
  if (chip) chip.classList.toggle('active', cb.checked);
  updateAllLayerPillBadges();
  chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  saveCurrentToHistory(false);
  renderAiCanvas();
  render();
}

function updateLayerChipStyles() {
  updateAllLayerPillBadges();
}

function onLayerFilterChange() {
  ['pos', 'parts', 'clauses', 'tenses', 'st'].forEach(id => {
    const cb = $('ai-layer-' + id);
    if (cb) aiLayers[id] = cb.checked;
  });

  updateAllLayerPillBadges();
  chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  saveCurrentToHistory(false);
  renderAiCanvas();
  render();
}

function onLayerItemFilterChange(layerId, itemKey, isChecked) {
  const cfg = LAYER_CONFIGS[layerId];
  if (!cfg) return;
  ensureLayerItems(aiLayers);
  aiLayers[cfg.itemsKey][itemKey] = isChecked;

  updateLayerPillBadge(layerId);
  chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  saveCurrentToHistory(false);
  renderAiCanvas();
  render();
}

function setAllLayerItems(layerId, isChecked) {
  const cfg = LAYER_CONFIGS[layerId];
  if (!cfg) return;
  ensureLayerItems(aiLayers);

  cfg.groups.forEach(g => {
    g.items.forEach(it => {
      aiLayers[cfg.itemsKey][it.key] = isChecked;
    });
  });

  const popover = $('ai-popover-' + layerId);
  if (popover) {
    popover.querySelectorAll(`input[data-layer="${layerId}"]`).forEach(cb => {
      cb.checked = isChecked;
    });
  }

  updateLayerPillBadge(layerId);
  chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
  saveCurrentToHistory(false);
  renderAiCanvas();
  render();
}

function syncLayerCheckboxes() {
  ensureLayerItems(aiLayers);
  ['pos', 'parts', 'clauses', 'tenses', 'st'].forEach(layerId => {
    const isAct = aiLayers[layerId] !== false;
    const mainCb = $('ai-layer-' + layerId);
    if (mainCb) mainCb.checked = isAct;
    const chip = $('ai-chip-' + layerId);
    if (chip) chip.classList.toggle('active', isAct);

    const cfg = LAYER_CONFIGS[layerId];
    if (cfg && aiLayers[cfg.itemsKey]) {
      const itemsMap = aiLayers[cfg.itemsKey];
      const popover = $('ai-popover-' + layerId);
      if (popover) {
        popover.querySelectorAll(`input[data-layer="${layerId}"]`).forEach(cb => {
          const key = cb.getAttribute('data-key');
          if (key) cb.checked = itemsMap[key] !== false;
        });
      }
    }
  });
  updateAllLayerPillBadges();
}

function setupLayerPopoversGlobalEvents() {
  if (layerPopoversGlobalEventsSetup) return;
  layerPopoversGlobalEventsSetup = true;

  document.addEventListener('click', (e) => {
    if (!activeLayerPopoverId) return;
    const wrap = e.target.closest('.ai-filter-pill-wrap');
    if (!wrap) {
      closeAllLayerPopovers();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeLayerPopoverId) {
      closeAllLayerPopovers();
    }
  });
}

function setupLayerFilterToolbar() {
  const container = $('ai-layer-pills');
  if (!container) return;
  container.innerHTML = '';

  ensureLayerItems(aiLayers);

  const layerOrder = ['parts', 'pos', 'clauses', 'tenses', 'st'];
  layerOrder.forEach(id => {
    const isActive = (activeLayer === id);
    const isVisible = (aiLayers[id] !== false);
    const color = LAYER_COLORS[id] || '#6366f1';
    const names = LAYER_SHORT_NAMES[id] || [id, id];
    const name = TL === 'ru' ? names[0] : names[1];

    const chip = document.createElement('div');
    chip.className = 'foma-layer-chip' + (isActive ? ' active' : '') + (!isVisible ? ' is-hidden' : '');
    chip.setAttribute('data-layer', id);

    const eyeTitle = isVisible ? L('Скрыть слой', 'Hide layer') : L('Показать слой', 'Show layer');
    const selectTitle = L(`Сделать «${name}» активным слоем`, `Select "${name}" as active layer`);

    const eyeSvg = isVisible
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    chip.innerHTML = `
      <button type="button" class="foma-layer-select-btn" data-select-layer="${id}" title="${selectTitle}">
        <span class="foma-layer-dot" style="background:${color};"></span>
        <span class="foma-layer-name">${name}</span>
      </button>
      <button type="button" class="foma-layer-eye-btn ${!isVisible ? 'eye-closed' : ''}" data-eye-layer="${id}" title="${eyeTitle}">
        ${eyeSvg}
      </button>
    `;

    chip.querySelector('.foma-layer-select-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      activeLayer = id;
      aiLayers[id] = true;
      tab = (id === 'parts' ? 'm' : id === 'pos' ? 'pos' : id === 'clauses' ? 'c' : id === 'tenses' ? 'f' : 's');
      chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
      setupLayerFilterToolbar();
      updateSidebarPalette();
      updateWordPopover();
      render();
      if (currentTopMode === 'ai' || currentAiIdeal) renderAiCanvas();
      if (VIEW !== 'tab') ui();
    });

    chip.querySelector('.foma-layer-eye-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      aiLayers[id] = (aiLayers[id] === false ? true : false);
      chrome.storage?.local?.set({ foma_ai_layers: aiLayers });
      setupLayerFilterToolbar();
      render();
      if (currentTopMode === 'ai' || currentAiIdeal) renderAiCanvas();
    });

    container.appendChild(chip);
  });
}

/* ── Interactive Sidebar Palette & Word Popover System ────────── */
const SIDEBAR_PALETTES = {
  parts: {
    title: ['Метки: Члены предложения', 'Tags: Sentence parts'],
    items: [
      { id: 'Subject', name: ['Подлежащее', 'Subject'], style: 'solid', kbd: '1' },
      { id: 'Predicate', name: ['Сказуемое', 'Predicate'], style: 'double', kbd: '2' },
      { id: 'Predicative', name: ['Предикатив', 'Predicative'], style: 'ddash', kbd: '3' },
      { id: 'Direct object', name: ['Прямое дополнение', 'Direct object'], style: 'dashed', kbd: '4' },
      { id: 'Indirect object', name: ['Косвенное дополнение', 'Indirect object'], style: 'dotted', kbd: '5' },
      { id: 'Attribute', name: ['Определение', 'Attribute'], style: 'wavy', kbd: '0' },
      { id: 'AdvM manner', name: ['Обст. образа действия', 'AdvM manner'], style: 'dashdot', kbd: '6' },
      { id: 'AdvM place', name: ['Обст. места', 'AdvM place'], style: 'dashdot', kbd: '7' },
      { id: 'AdvM time', name: ['Обст. времени', 'AdvM time'], style: 'dashdot', kbd: '8' },
      { id: 'Introductory element', name: ['Вводное слово', 'Introductory element'], style: 'dotted', kbd: '' }
    ],
    apply: (item) => {
      if (!sel.length) { msg(L('Сначала выделите слово или слова.', 'Select words first.')); return; }
      setA('m', item.id);
      ui();
    }
  },
  pos: {
    title: ['Метки: Части речи', 'Tags: Parts of speech'],
    items: [
      { id: 'n', name: ['Существительное', 'Noun'], abbr: 'n.', kbd: '1' },
      { id: 'v', name: ['Глагол', 'Verb'], abbr: 'v.', kbd: '2' },
      { id: 'adj', name: ['Прилагательное', 'Adjective'], abbr: 'adj.', kbd: '3' },
      { id: 'adv', name: ['Наречие', 'Adverb'], abbr: 'adv.', kbd: '4' },
      { id: 'pron', name: ['Местоимение', 'Pronoun'], abbr: 'pron.', kbd: '5' },
      { id: 'prep', name: ['Предлог', 'Preposition'], abbr: 'prep.', kbd: '6' },
      { id: 'conj', name: ['Союз', 'Conjunction'], abbr: 'conj.', kbd: '7' },
      { id: 'art', name: ['Артикль', 'Article'], abbr: 'art.', kbd: '8' },
      { id: 'num', name: ['Числительное', 'Numeral'], abbr: 'num.', kbd: '9' },
      { id: 'part', name: ['Частица', 'Particle'], abbr: 'part.', kbd: '' }
    ],
    apply: (item) => {
      if (!sel.length) { msg(L('Сначала выделите слово.', 'Select a word first.')); return; }
      setP(item.id);
      ui();
    }
  },
  clauses: {
    title: ['Метки: Придаточные и обороты', 'Tags: Clauses & phrases'],
    items: [
      { id: 'Main clause', name: ['Главное предложение', 'Main clause'], kbd: '1' },
      { id: 'Coordinate clause', name: ['Сочинённое предлож.', 'Coordinate clause'], kbd: '2' },
      { id: 'Subject clause', name: ['Придаточное подлежащее', 'Subject clause'], kbd: '3' },
      { id: 'Object clause', name: ['Придаточное дополнение', 'Object clause'], kbd: '4' },
      { id: 'Attributive clause (defining)', name: ['Придаточное определит.', 'Attributive clause'], kbd: '5' },
      { id: 'AdvCl time', name: ['Придаточное времени', 'AdvCl time'], kbd: '6' },
      { id: 'AdvCl condition', name: ['Придаточное условия', 'AdvCl condition'], kbd: '7' },
      { id: 'Prepositional phrase', name: ['Предложный оборот', 'Prepositional phrase'], kbd: '8' },
      { id: 'Participial phrase', name: ['Причастный оборот', 'Participial phrase'], kbd: '9' }
    ],
    apply: (item) => {
      if (!sel.length) { msg(L('Сначала выделите слова.', 'Select words first.')); return; }
      setA('c', item.id);
      ui();
    }
  },
  tenses: {
    title: ['Метки: Время и залог', 'Tags: Tense & voice'],
    items: [
      { id: '0|Present', name: ['Present (настоящее)', 'Present'], kbd: '1' },
      { id: '0|Past', name: ['Past (прошедшее)', 'Past'], kbd: '2' },
      { id: '0|Future', name: ['Future (будущее)', 'Future'], kbd: '3' },
      { id: '1|Simple', name: ['Simple (простое)', 'Simple'], kbd: '4' },
      { id: '1|Continuous', name: ['Continuous (длительное)', 'Continuous'], kbd: '5' },
      { id: '1|Perfect', name: ['Perfect (совершенное)', 'Perfect'], kbd: '6' },
      { id: '2|Active', name: ['Active (действительный)', 'Active'], kbd: '7' },
      { id: '2|Passive', name: ['Passive (страдательный)', 'Passive'], kbd: '8' }
    ],
    apply: (item) => {
      const [g, v] = item.id.split('|');
      FS[+g] = FS[+g] === v ? '' : v;
      const l = FS.filter(Boolean).join(' ');
      if (!sel.length) { ui(); msg(L('Сначала выделите слова.', 'Select words first.')); return; }
      setA('f', l, [...FS], true);
      ui();
    }
  },
  st: {
    title: ['Метки: Тип предложения', 'Tags: Sentence type'],
    items: [
      { id: '0|Simple', name: ['Simple (простое)', 'Simple'], kbd: '1' },
      { id: '0|Compound', name: ['Compound (сложносочин.)', 'Compound'], kbd: '2' },
      { id: '0|Complex', name: ['Complex (сложноподчин.)', 'Complex'], kbd: '3' },
      { id: '1|Declarative', name: ['Повествовательное', 'Declarative'], kbd: '4' },
      { id: '1|Interrogative', name: ['Вопросительное', 'Interrogative'], kbd: '5' },
      { id: '1|Imperative', name: ['Побудительное', 'Imperative'], kbd: '6' }
    ],
    apply: (item) => {
      const [g, v] = item.id.split('|');
      ST[+g] = ST[+g] === v ? '' : v;
      if (ST[+g]) ensureLayerItemVisible('st', ST[+g]);
      saveCurrentToHistory(false);
      render();
      ui();
    }
  }
};

function updateSidebarPalette() {
  const titleEl = $('sidebar-legend-title');
  const listEl = $('sidebar-legend-list');
  if (!listEl) return;

  const cfg = SIDEBAR_PALETTES[activeLayer] || SIDEBAR_PALETTES.parts;
  if (titleEl) {
    titleEl.textContent = TL === 'ru' ? cfg.title[0] : cfg.title[1];
  }

  listEl.innerHTML = '';
  cfg.items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-legend-item';
    const label = TL === 'ru' ? item.name[0] : item.name[1];

    let sampleHtml = '';
    if (item.style) {
      sampleHtml = `<span class="legend-sample sample-${item.style}">Aa</span>`;
    } else if (item.abbr) {
      sampleHtml = `<span class="legend-sample" style="color:${LAYER_COLORS[activeLayer]}; font-size:11px; font-weight:700;">${item.abbr}</span>`;
    } else {
      sampleHtml = `<span class="foma-layer-dot" style="background:${LAYER_COLORS[activeLayer]};"></span>`;
    }

    const kbdHtml = item.kbd ? `<kbd class="legend-hotkey">${item.kbd}</kbd>` : '';

    btn.innerHTML = `
      ${sampleHtml}
      <span class="legend-label">${label}</span>
      ${kbdHtml}
    `;

    btn.addEventListener('click', () => {
      cfg.apply(item);
      updateSidebarPalette();
      updateWordPopover();
      updateProgressBar();
    });

    listEl.appendChild(btn);
  });
}

let popoverStep = 'parts'; // 'parts' | 'pos' | 'sub'
let popoverLastSelWord = null;

const POP_PARTS_ITEMS = [
  { id: 'Subject', name: ['Подлежащее', 'Subject'], sym: '——', kbd: '1' },
  { id: 'Predicate', name: ['Сказуемое', 'Predicate'], sym: '══', kbd: '2' },
  { id: 'Predicative', name: ['Предикатив', 'Predicative'], sym: '====', kbd: '3' },
  { id: 'Direct object', name: ['Прямое дополн.', 'Direct object'], sym: '----', kbd: '4' },
  { id: 'Indirect object', name: ['Косвенное дополн.', 'Indirect object'], sym: '····', kbd: '5' },
  { id: 'Attribute', name: ['Определение', 'Attribute'], sym: '~~~~', kbd: '0' },
  { id: 'AdvM manner', name: ['Обст. образа дейст.', 'AdvM manner'], sym: '-·-·', kbd: '6' },
  { id: 'AdvM place', name: ['Обст. места', 'AdvM place'], sym: '-·-·', kbd: '7' },
  { id: 'AdvM time', name: ['Обст. времени', 'AdvM time'], sym: '-·-·', kbd: '8' },
  { id: 'AdvM frequency', name: ['Обст. частоты', 'AdvM frequency'], sym: '-·-·', kbd: '9' },
  { id: 'Prepositional object', name: ['Предложное дополн.', 'Prep. object'], sym: '----', kbd: '' },
  { id: 'Apposition', name: ['Приложение', 'Apposition'], sym: '~~~~', kbd: '' },
  { id: 'Introductory element', name: ['Вводное слово', 'Intro element'], sym: '····', kbd: '' },
  { id: 'Address', name: ['Обращение', 'Address'], sym: '····', kbd: '' }
];

const POP_POS_ITEMS = [
  { id: 'n', name: ['Существительное', 'Noun'], abbr: 'n.', kbd: '1' },
  { id: 'v', name: ['Глагол', 'Verb'], abbr: 'v.', kbd: '2' },
  { id: 'adj', name: ['Прилагательное', 'Adjective'], abbr: 'adj.', kbd: '3' },
  { id: 'adv', name: ['Наречие', 'Adverb'], abbr: 'adv.', kbd: '4' },
  { id: 'pron', name: ['Местоимение', 'Pronoun'], abbr: 'pron.', kbd: '5' },
  { id: 'prep', name: ['Предлог', 'Preposition'], abbr: 'prep.', kbd: '6' },
  { id: 'conj', name: ['Союз', 'Conjunction'], abbr: 'conj.', kbd: '7' },
  { id: 'art', name: ['Артикль', 'Article'], abbr: 'art.', kbd: '8' },
  { id: 'num', name: ['Числительное', 'Numeral'], abbr: 'num.', kbd: '9' },
  { id: 'part', name: ['Частица', 'Particle'], abbr: 'part.', kbd: '0' },
  { id: 'det', name: ['Детерминатив', 'Determiner'], abbr: 'det.', kbd: '' },
  { id: 'int', name: ['Междометие', 'Interjection'], abbr: 'int.', kbd: '' }
];

const POS_GROUP_TITLES = {
  n: [
    ['Тип', 'Type'],
    ['Исчисляемость', 'Countability'],
    ['Категория', 'Category'],
    ['Число', 'Number'],
    ['Падеж', 'Case']
  ],
  pron: [
    ['Разряд', 'Type'],
    ['Падеж', 'Case'],
    ['Форма', 'Form']
  ],
  adj: [
    ['Разряд', 'Type'],
    ['Степень', 'Degree']
  ],
  num: [
    ['Тип', 'Type']
  ],
  v: [
    ['Функция', 'Function'],
    ['Форма', 'Form'],
    ['Спряжение', 'Conjugation'],
    ['Переходность', 'Transitivity']
  ],
  adv: [
    ['Значение', 'Meaning'],
    ['Степень', 'Degree']
  ],
  art: [
    ['Тип', 'Type']
  ],
  prep: [
    ['Состав', 'Structure'],
    ['Значение', 'Meaning']
  ],
  conj: [
    ['Разряд', 'Type']
  ],
  part: [
    ['Значение', 'Meaning']
  ],
  det: [
    ['Тип', 'Type']
  ]
};

const SUB_LOCALES = {
  // Noun
  'common': ['нарицательное', 'common'],
  'proper': ['собственное', 'proper'],
  'countable': ['исчисляемое', 'countable'],
  'uncountable': ['неисчисляемое', 'uncountable'],
  'concrete': ['конкретное', 'concrete'],
  'abstract': ['абстрактное', 'abstract'],
  'collective': ['собирательное', 'collective'],
  'material': ['вещественное', 'material'],
  'singular': ['ед. число', 'singular'],
  'plural': ['мн. число', 'plural'],
  'common case': ['общий падеж', 'common case'],
  'possessive case': ['притяжательный', 'possessive case'],

  // Pronoun
  'personal': ['личное', 'personal'],
  'possessive': ['притяжательное', 'possessive'],
  'reflexive': ['возвратное', 'reflexive'],
  'demonstrative': ['указательное', 'demonstrative'],
  'interrogative': ['вопросительное', 'interrogative'],
  'relative': ['относительное', 'relative'],
  'indefinite': ['неопределенное', 'indefinite'],
  'negative': ['отрицательное', 'negative'],
  'reciprocal': ['взаимное', 'reciprocal'],
  'defining': ['определительное', 'defining'],
  'nominative': ['именительный (nom)', 'nominative'],
  'objective': ['объектный (obj)', 'objective'],
  'conjoint': ['присоединенная (my)', 'conjoint'],
  'absolute': ['абсолютная (mine)', 'absolute'],

  // Verb
  'notional': ['смысловой', 'notional'],
  'auxiliary': ['вспомогательный', 'auxiliary'],
  'modal': ['модальный', 'modal'],
  'link': ['связка', 'link'],
  'finite': ['личная форма', 'finite'],
  'infinitive': ['инфинитив', 'infinitive'],
  'gerund': ['герундий', 'gerund'],
  'participle I': ['причастие I (-ing)', 'participle I'],
  'participle II': ['причастие II (-ed)', 'participle II'],
  'regular': ['правильный', 'regular'],
  'irregular': ['неправильный', 'irregular'],
  'transitive': ['переходный', 'transitive'],
  'intransitive': ['непереходный', 'intransitive'],

  // Adjective
  'qualitative': ['качественное', 'qualitative'],
  'relative': ['относительное', 'relative'],
  'positive': ['положительная', 'positive'],
  'comparative': ['сравнительная', 'comparative'],
  'superlative': ['превосходная', 'superlative'],

  // Adverb
  'manner': ['образа действия', 'manner'],
  'place': ['места', 'place'],
  'time': ['времени', 'time'],
  'frequency': ['частотности', 'frequency'],
  'degree': ['степени', 'degree'],
  'interrogative': ['вопросительное', 'interrogative'],

  // Numeral
  'cardinal': ['количественное', 'cardinal'],
  'ordinal': ['порядковое', 'ordinal'],

  // Article
  'definite': ['определенный (the)', 'definite'],
  'indefinite': ['неопределенный (a/an)', 'indefinite'],

  // Preposition
  'simple': ['простой', 'simple'],
  'compound': ['составной', 'compound'],
  'phrasal': ['фразовый', 'phrasal'],
  'direction': ['направления', 'direction'],
  'cause': ['причины', 'cause'],
  'other': ['другое', 'other'],

  // Conjunction
  'coordinating': ['сочинительный', 'coordinating'],
  'subordinating': ['подчинительный', 'subordinating'],
  'correlative': ['двойной/парный', 'correlative'],

  // Particle
  'infinitive to': ['частица to', 'infinitive to'],
  'emphatic': ['усилительная', 'emphatic'],

  // Determiner
  'quantifier': ['количественный', 'quantifier'],
  'distributive': ['разделительный', 'distributive']
};

function updateWordPopover() {
  const popover = $('word-popover');
  if (!popover) return;

  if (!showWordPopover || !sel || !sel.length) {
    popover.style.display = 'none';
    return;
  }

  const selectedToks = sel.map(i => toks[i]).filter(Boolean);
  if (!selectedToks.length) {
    popover.style.display = 'none';
    return;
  }

  const selKey = sel.join(',');
  if (selKey !== popoverLastSelWord) {
    popoverLastSelWord = selKey;
    popoverStep = 'parts';
  }

  const minX = Math.min(...selectedToks.map(t => t.x));
  const maxX = Math.max(...selectedToks.map(t => t.x + t.w));
  const centerX = (minX + maxX) / 2;
  const lineIdx = selectedToks[0].line;
  const L = Ls[lineIdx];
  const topY = L ? (L.b + (L.mb ? 12 + L.mb * MR : 20)) : 100;

  popover.style.display = 'flex';
  popover.classList.toggle('layout-column', wordPopoverLayout === 'column');
  popover.innerHTML = '';

  const primaryTok = selectedToks[0];
  const curPos = primaryTok?.p;

  // 1. Navigation / Step Header
  const navEl = document.createElement('div');
  navEl.className = 'word-popover-nav';

  const stepsEl = document.createElement('div');
  stepsEl.className = 'word-popover-steps';

  // Step 1: Члены
  const step1Btn = document.createElement('button');
  step1Btn.type = 'button';
  step1Btn.className = 'word-step-btn' + (popoverStep === 'parts' ? ' active' : '');
  step1Btn.textContent = TL === 'ru' ? '1. Член' : '1. Part';
  step1Btn.title = TL === 'ru' ? 'Шаг 1: Выбрать член предложения' : 'Step 1: Choose sentence part';
  step1Btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverStep = 'parts';
    updateWordPopover();
  });
  stepsEl.appendChild(step1Btn);

  // Step 2: POS
  const step2Btn = document.createElement('button');
  step2Btn.type = 'button';
  step2Btn.className = 'word-step-btn' + (popoverStep === 'pos' ? ' active' : '');
  step2Btn.textContent = TL === 'ru' ? '2. POS' : '2. POS';
  step2Btn.title = TL === 'ru' ? 'Шаг 2: Выбрать часть речи' : 'Step 2: Choose part of speech';
  step2Btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverStep = 'pos';
    updateWordPopover();
  });
  stepsEl.appendChild(step2Btn);

  // Step 3: Доп.
  const step3Btn = document.createElement('button');
  step3Btn.type = 'button';
  step3Btn.className = 'word-step-btn' + (popoverStep === 'sub' ? ' active' : '') + (!curPos ? ' disabled' : '');
  step3Btn.textContent = TL === 'ru' ? '3. Доп.' : '3. Sub';
  step3Btn.title = !curPos
    ? (TL === 'ru' ? 'Сначала выберите часть речи на Шаге 2' : 'Select part of speech on Step 2 first')
    : (TL === 'ru' ? 'Шаг 3: Дополнительные параметры части речи' : 'Step 3: Sub-parameters');
  if (!curPos) {
    step3Btn.disabled = true;
    step3Btn.style.opacity = '0.45';
    step3Btn.style.cursor = 'not-allowed';
  } else {
    step3Btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popoverStep = 'sub';
      updateWordPopover();
    });
  }
  stepsEl.appendChild(step3Btn);

  navEl.appendChild(stepsEl);

  // Nav Actions: Back, Layout toggle, Done, Clear
  const navActions = document.createElement('div');
  navActions.className = 'word-nav-actions';

  if (popoverStep !== 'parts') {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'word-nav-btn word-nav-btn-back';
    backBtn.textContent = '←';
    backBtn.title = TL === 'ru' ? 'Назад' : 'Back';
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popoverStep === 'sub') popoverStep = 'pos';
      else if (popoverStep === 'pos') popoverStep = 'parts';
      updateWordPopover();
    });
    navActions.appendChild(backBtn);
  }

  // Quick 1-click Layout Switcher (Row vs Column)
  const layoutBtn = document.createElement('button');
  layoutBtn.type = 'button';
  layoutBtn.className = 'word-nav-btn word-nav-btn-layout';
  const isCol = wordPopoverLayout === 'column';
  layoutBtn.innerHTML = isCol
    ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`
    : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="4" width="6" height="16" rx="1.5"/><rect x="14" y="4" width="6" height="16" rx="1.5"/></svg>`;
  layoutBtn.title = isCol
    ? (TL === 'ru' ? 'Переключить в строку (чипы)' : 'Switch to row layout')
    : (TL === 'ru' ? 'Переключить в столбец' : 'Switch to column layout');
  layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setWordPopoverLayout(wordPopoverLayout === 'column' ? 'row' : 'column');
  });
  navActions.appendChild(layoutBtn);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'word-nav-btn word-nav-btn-done';
  doneBtn.innerHTML = `<span>✓</span><span>${TL === 'ru' ? 'Готово' : 'Done'}</span>`;
  doneBtn.title = TL === 'ru' ? 'Завершить выбор' : 'Done';
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.style.display = 'none';
  });
  navActions.appendChild(doneBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'word-nav-btn word-nav-btn-del';
  delBtn.innerHTML = `<span>✕</span>`;
  delBtn.title = TL === 'ru' ? 'Снять метки (Del)' : 'Remove marks (Del)';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    del();
    updateWordPopover();
    updateSidebarPalette();
    updateProgressBar();
  });
  navActions.appendChild(delBtn);

  navEl.appendChild(navActions);
  popover.appendChild(navEl);

  // 2. Body Container
  const bodyEl = document.createElement('div');
  bodyEl.className = 'word-popover-body';

  if (popoverStep === 'parts') {
    // ── STEP 1: SENTENCE PARTS with graphic underline symbol in front ──
    const isDarkTheme = currentTheme === 'dark';
    POP_PARTS_ITEMS.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word-popover-btn';
      const label = TL === 'ru' ? item.name[0] : item.name[1];
      const kbdHtml = item.kbd ? `<span class="kbd-badge">${item.kbd}</span>` : '';
      const partColor = getPartColor(item.id, isDarkTheme);
      const symHtml = `<span class="pop-sym" style="color:${partColor};font-weight:700;">${item.sym}</span>`;

      const isPartActive = an.some(a => a.k === 'm' && a.v === item.id && sel.every(si => a.ix.includes(si)));
      if (isPartActive) btn.classList.add('active');

      btn.innerHTML = `${symHtml}<span>${label}</span>${kbdHtml}`;
      btn.title = label;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setA('m', item.id);
        popoverStep = 'pos'; // Auto-advance to Step 2
        updateWordPopover();
        updateSidebarPalette();
        updateProgressBar();
      });

      bodyEl.appendChild(btn);
    });
  } else if (popoverStep === 'pos') {
    // ── STEP 2: PARTS OF SPEECH ──
    const isDarkTheme = currentTheme === 'dark';
    const curM = an.find(a => a.k === 'm' && sel.some(si => a.ix.includes(si)))?.v;
    const allowedPos = curM ? getSpPos(curM) : ALL_POS_KEYS;

    if (curM) {
      const infoBanner = document.createElement('div');
      infoBanner.style.width = '100%';
      infoBanner.style.padding = '2px 4px 6px';
      infoBanner.style.fontSize = '11px';
      infoBanner.style.color = isDarkTheme ? '#a1a1aa' : '#64748b';
      infoBanner.style.display = 'flex';
      infoBanner.style.alignItems = 'center';
      infoBanner.style.gap = '6px';
      infoBanner.innerHTML = `<span>${TL === 'ru' ? 'Для роли:' : 'For role:'}</span><strong style="color:${getPartColor(curM, isDarkTheme)};">${getRuMNom(curM)}</strong>`;
      bodyEl.appendChild(infoBanner);
    }

    POP_POS_ITEMS.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word-popover-btn';
      const label = TL === 'ru' ? item.name[0] : item.name[1];
      const kbdHtml = item.kbd ? `<span class="kbd-badge">${item.kbd}</span>` : '';
      const posColor = getPosColor(item.id, isDarkTheme);

      const isPosActive = (primaryTok?.p === item.id);
      if (isPosActive) btn.classList.add('active');

      const isAllowed = allowedPos.includes(item.id);
      if (!isAllowed) {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.title = TL === 'ru'
          ? `${getRuMNom(curM)} не может быть выражено ${RU_P_INSTR[item.id] || item.name[0]}.`
          : `“${curM}” cannot be expressed by ${item.name[1].toLowerCase()}.`;
      } else {
        btn.title = `${label} (${item.abbr})`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setP(item.id, true, false);
          if (PO[item.id]?.[2]?.length > 0) {
            popoverStep = 'sub'; // Auto-advance to Step 3
          }
          updateWordPopover();
          updateSidebarPalette();
          updateProgressBar();
        });
      }

      btn.innerHTML = `<span>${label}</span><span style="color:${isAllowed ? posColor : (isDarkTheme ? '#52525b' : '#94a3b8')};font-weight:600;font-size:11px;">(${item.abbr})</span>${kbdHtml}`;

      bodyEl.appendChild(btn);
    });
  } else if (popoverStep === 'sub') {
    // ── STEP 3: SUB-PARAMETERS ──
    if (!curPos || !PO[curPos]) {
      const hint = document.createElement('div');
      hint.style.padding = '12px 14px';
      hint.style.fontSize = '12px';
      hint.style.display = 'flex';
      hint.style.flexDirection = 'column';
      hint.style.gap = '8px';
      hint.style.alignItems = 'flex-start';
      hint.style.color = '#64748b';
      hint.innerHTML = `
        <span>${TL === 'ru' ? 'Сначала выберите часть речи на Шаге 2.' : 'Please select a part of speech in Step 2 first.'}</span>
        <button type="button" class="word-nav-btn word-nav-btn-done" style="background:#3B83BD;color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">
          ${TL === 'ru' ? '← Перейти к Шагу 2 (POS)' : '← Go to Step 2 (POS)'}
        </button>
      `;
      hint.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        popoverStep = 'pos';
        updateWordPopover();
      });
      bodyEl.appendChild(hint);
    } else {
      const posName = TL === 'ru' ? (PO[curPos][0] || curPos) : (PO[curPos][0] || curPos);
      const groups = PO[curPos][2] || [];
      const titles = POS_GROUP_TITLES[curPos] || [];

      if (!groups.length) {
        const noSubs = document.createElement('div');
        noSubs.style.padding = '8px 12px';
        noSubs.style.fontSize = '12px';
        noSubs.style.color = '#64748b';
        noSubs.textContent = TL === 'ru'
          ? `У части речи «${posName}» нет дополнительных параметров.`
          : `"${posName}" has no additional parameters.`;
        bodyEl.appendChild(noSubs);
      } else {
        const currentSubs = primaryTok.s || [];

        groups.forEach((group, gIdx) => {
          const groupTitlePair = titles[gIdx] || [L('Группа', 'Group') + ' ' + (gIdx + 1), 'Group ' + (gIdx + 1)];
          const gTitle = TL === 'ru' ? groupTitlePair[0] : groupTitlePair[1];

          const groupEl = document.createElement('div');
          groupEl.className = 'word-sub-group';

          const titleEl = document.createElement('div');
          titleEl.className = 'word-sub-title';
          titleEl.textContent = gTitle;
          groupEl.appendChild(titleEl);

          const chipsEl = document.createElement('div');
          chipsEl.className = 'word-sub-chips';

          group.forEach(val => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'word-sub-btn';

            const locPair = SUB_LOCALES[val] || [val, val];
            const locName = TL === 'ru' ? locPair[0] : locPair[1];
            const isSubActive = currentSubs.includes(val);

            if (isSubActive) btn.classList.add('active');

            btn.innerHTML = `<span>${locName}</span>${isSubActive ? '<span class="check-mark">✓</span>' : ''}`;
            btn.title = `${val} (${locName})`;

            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              togSub(val);
              updateWordPopover();
              updateProgressBar();
            });

            chipsEl.appendChild(btn);
          });

          groupEl.appendChild(chipsEl);
          bodyEl.appendChild(groupEl);
        });

        const footerEl = document.createElement('div');
        footerEl.style.display = 'flex';
        footerEl.style.justifyContent = 'flex-end';
        footerEl.style.padding = '8px 10px 4px';
        footerEl.style.borderTop = '1px solid var(--foma-border, #e2e8f0)';
        footerEl.style.marginTop = '6px';
        footerEl.style.width = '100%';
        const doneSubBtn = document.createElement('button');
        doneSubBtn.type = 'button';
        doneSubBtn.className = 'word-nav-btn word-nav-btn-done';
        doneSubBtn.innerHTML = `<span>✓</span><span>${TL === 'ru' ? 'Готово' : 'Done'}</span>`;
        doneSubBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.style.display = 'none';
        });
        footerEl.appendChild(doneSubBtn);
        bodyEl.appendChild(footerEl);
      }
    }
  }

  popover.appendChild(bodyEl);

  // Position and clamp popover so it never escapes container or screen boundaries
  const wrapEl = $('wrap');
  const wrapW = wrapEl ? wrapEl.clientWidth : (window.innerWidth || 800);
  const wrapH = wrapEl ? wrapEl.clientHeight : 280;
  const scrollL = wrapEl ? wrapEl.scrollLeft : 0;
  const scrollT = wrapEl ? wrapEl.scrollTop : 0;

  const popW = popover.offsetWidth || 340;
  const popH = popover.offsetHeight || 180;

  // Center horizontally over selected word(s)
  const targetLeft = centerX - (popW / 2);
  const minLeft = scrollL + 12;
  const maxLeft = Math.max(minLeft, scrollL + wrapW - popW - 12);
  const finalLeft = Math.max(minLeft, Math.min(targetLeft, maxLeft));

  // Vertical: default below line markings
  let finalTop = topY;
  // If placing below overflows container height, try placing above selected word
  const wordTop = selectedToks[0]?.y ?? (L ? (L.b - 24) : 40);
  if (finalTop + popH > scrollT + wrapH - 10 && (wordTop - popH) > scrollT + 10) {
    finalTop = wordTop - popH - 8;
  } else {
    const maxTop = Math.max(scrollT + 10, scrollT + wrapH - popH - 10);
    finalTop = Math.max(scrollT + 8, Math.min(finalTop, maxTop));
  }

  popover.style.left = Math.round(finalLeft) + 'px';
  popover.style.top = Math.round(finalTop) + 'px';
}

function updateProgressBar() {
  const bar = $('top-progress-bar');
  if (bar) {
    bar.style.display = showProgressBar ? '' : 'none';
  }
  if (!showProgressBar) return;
  const fill = $('top-progress-fill');
  if (!fill) return;

  const wordToks = toks.filter(k => k.word);
  const total = wordToks.length;
  if (!total) {
    fill.style.width = '0%';
    return;
  }

  const tagged = toks.filter((k, i) => k.word && (k.p != null || an.some(a => a.ix.includes(i)))).length;
  const pct = Math.min(100, Math.round((tagged / total) * 100));
  fill.style.width = pct + '%';
  fill.title = L(`Размечено: ${tagged} из ${total} (${pct}%)`, `Marked: ${tagged} of ${total} (${pct}%)`);
}

function setupWordHoverTooltip() {
  const tooltip = $('word-hover-tooltip');
  if (!cv || !tooltip) return;

  cv.addEventListener('mousemove', e => {
    const i = hitW(e);
    if (i < 0 || !toks[i] || !toks[i].word) {
      tooltip.style.display = 'none';
      return;
    }

    const tok = toks[i];
    const mList = an.filter(a => a.k === 'm' && a.ix.includes(i)).map(a => a.v);
    const cList = an.filter(a => a.k === 'c' && a.ix.includes(i)).map(a => a.v);
    const fList = an.filter(a => a.k === 'f' && a.ix.includes(i)).map(a => a.v);
    const posName = tok.p ? (PO[tok.p] ? (TL === 'ru' ? PO[tok.p][0] : PO[tok.p][0]) : tok.p) : null;
    const posSubs = tok.s && tok.s.length ? `(${tok.s.join(', ')})` : '';

    if (!posName && !mList.length && !cList.length && !fList.length) {
      tooltip.style.display = 'none';
      return;
    }

    let rowsHtml = `<div class="word-hover-title">«${tok.t}»</div>`;
    if (posName) {
      rowsHtml += `<div class="word-hover-row"><span class="word-hover-key" style="color:${LAYER_COLORS.pos}">POS:</span> <span class="word-hover-val">${posName} ${posSubs}</span></div>`;
    }
    if (mList.length) {
      rowsHtml += `<div class="word-hover-row"><span class="word-hover-key" style="color:${LAYER_COLORS.parts}">Part:</span> <span class="word-hover-val">${mList.join(', ')}</span></div>`;
    }
    if (cList.length) {
      rowsHtml += `<div class="word-hover-row"><span class="word-hover-key" style="color:${LAYER_COLORS.clauses}">Clause:</span> <span class="word-hover-val">${cList.join(', ')}</span></div>`;
    }
    if (fList.length) {
      rowsHtml += `<div class="word-hover-row"><span class="word-hover-key" style="color:${LAYER_COLORS.tenses}">Tense:</span> <span class="word-hover-val">${fList.join(', ')}</span></div>`;
    }

    tooltip.innerHTML = rowsHtml;
    const wrapEl = $('wrap');
    const wrapRect = wrapEl ? wrapEl.getBoundingClientRect() : { left: 0, top: 0 };
    const x = e.clientX - wrapRect.left + 14;
    const y = e.clientY - wrapRect.top + 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.display = 'block';
  });

  cv.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  // Keep popover securely clamped when scrolling or resizing
  $('wrap')?.addEventListener('scroll', () => {
    if (showWordPopover && $('word-popover')?.style.display !== 'none' && sel.length > 0) {
      updateWordPopover();
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (showWordPopover && $('word-popover')?.style.display !== 'none' && sel.length > 0) {
      updateWordPopover();
    }
  }, { passive: true });
}



function renderAiIdealSchema(ideal) {
  if (ideal) currentAiIdeal = ideal;
  renderAiCanvas();
}

function setRenderMode(mode) {
  if (mode !== 'color_focus' && mode !== 'bw') return;
  renderMode = mode;
  try {
    localStorage.setItem('foma_render_mode', mode);
  } catch (_) {}

  const btnColor = $('btn-render-color');
  const btnBw = $('btn-render-bw');
  if (btnColor) btnColor.classList.toggle('active', mode === 'color_focus');
  if (btnBw) btnBw.classList.toggle('active', mode === 'bw');

  render();
  if (currentTopMode === 'ai' || currentAiIdeal) {
    renderAiCanvas();
  }
}

function copyColorScheme() {
  if (currentTopMode === 'ai') {
    if (!currentAiIdeal) return msg(L('Разбор от ИИ ещё не готов.', 'AI parse not ready yet.'));
    const sc = +$('sc').value;
    const prevMode = renderMode;
    renderMode = 'color_focus';
    const c = exportAiCanvas(sc);
    renderMode = prevMode;
    if (!c) return msg(L('Нет изображения для копирования.', 'No image to copy.'));
    copyCanvas(c, () => {
      msg(L('Цветная схема разбора ИИ скопирована в буфер (Ctrl+V).', 'Colored AI parse image copied to clipboard (Ctrl+V).'));
    }, (url) => showImg(url));
    return;
  }
  if (!toks.some(k => k.word)) return msg(L('Нет текста для копирования.', 'No text to copy.'));
  const sc = +$('sc').value;
  const prevMode = renderMode;
  renderMode = 'color_focus';
  const c = exportCanvas(sc);
  renderMode = prevMode;
  copyCanvas(c, () => {
    msg(L('Цветная схема скопирована в буфер (Ctrl+V).', 'Colored diagram copied to clipboard (Ctrl+V).'));
  }, (url) => showImg(url));
}

function copyBwScheme() {
  if (currentTopMode === 'ai') {
    if (!currentAiIdeal) return msg(L('Разбор от ИИ ещё не готов.', 'AI parse not ready yet.'));
    const sc = +$('sc').value;
    const prevMode = renderMode;
    renderMode = 'bw';
    const c = exportAiCanvas(sc);
    renderMode = prevMode;
    if (!c) return msg(L('Нет изображения для копирования.', 'No image to copy.'));
    copyCanvas(c, () => {
      msg(L('Ч/Б схема разбора ИИ скопирована в буфер (Ctrl+V).', 'B&W AI parse image copied to clipboard (Ctrl+V).'));
    }, (url) => showImg(url));
    return;
  }
  if (!toks.some(k => k.word)) return msg(L('Нет текста для копирования.', 'No text to copy.'));
  const sc = +$('sc').value;
  const prevMode = renderMode;
  renderMode = 'bw';
  const c = exportCanvas(sc);
  renderMode = prevMode;
  copyCanvas(c, () => {
    msg(L('Классическая Ч/Б схема скопирована в буфер (Ctrl+V).', 'Classic B&W diagram copied to clipboard (Ctrl+V).'));
  }, (url) => showImg(url));
}

function setupSidebarEvents() {
  $('btn-render-color')?.addEventListener('click', () => setRenderMode('color_focus'));
  $('btn-render-bw')?.addEventListener('click', () => setRenderMode('bw'));
  $('btn-copy-color-scheme')?.addEventListener('click', () => copyColorScheme());
  $('btn-copy-bw-scheme')?.addEventListener('click', () => copyBwScheme());
}

function updateAiHeaderInfo() {
  const prov = AI.provider || 'positionapi';
  const provShort = prov === 'groq' ? 'Groq' : (prov === 'positionapi' ? 'PositionAPI' : 'Custom');
  const curModel = lastAiFilledModel || AI.activeModel[prov] || PROVIDERS[prov]?.defaultModel || '—';
  const displayModel = curModel.replace(/^openai\//, '');

  const provSpan = $('ai-combo-prov');
  if (provSpan) provSpan.textContent = provShort;

  const modelSpan = $('ai-combo-model');
  if (modelSpan) modelSpan.textContent = displayModel;

  const lat = $('ai-model-latency');
  if (lat) {
    if (lastAiFilledLatency) {
      lat.style.display = 'inline-flex';
      lat.textContent = `⏱ ${lastAiFilledLatency} с`;
    } else {
      lat.style.display = 'none';
    }
  }

  const lbl = $('ai-model-name-label');
  if (lbl) lbl.textContent = curModel;

  const tag = $('top-mode-ai-tag');
  if (tag) {
    if (lastAiFilledModel) {
      tag.style.display = 'inline-block';
      tag.textContent = lastAiFilledModel;
    } else {
      tag.style.display = 'none';
    }
  }

  updateAiKeyInlineBar();
  syncAiSelectors();
  updateAiGranularityButtons();
}

function renderAiVerdictCard(r) {
  const card = $('ai-verdict-card');
  if (!card) return;
  card.style.display = 'block';

  const sum = $('ai-verdict-summary');
  if (sum) {
    sum.textContent = r.summary || L('Полный синтаксический разбор предложения сформирован моделью.', 'Full syntactic sentence analysis generated by model.');
  }

  const stats = $('ai-parsed-stats');
  if (stats && currentAiIdeal) {
    const nParts = (currentAiIdeal.an || []).filter(a => a.k === 'm').length;
    const nClauses = (currentAiIdeal.an || []).filter(a => a.k === 'c').length;
    const nPos = (currentAiIdeal.toks || []).filter(t => t.p).length;
    const stStr = (currentAiIdeal.st || []).filter(Boolean).join(' · ');
    const granNote = aiGranularity === 'macro' ? L('составной', 'macro') : L('детальный', 'detailed');
    stats.textContent = `${nParts} ${L('членов предложения', 'sentence parts')} (${granNote}) · ${nPos} ${L('частей речи', 'POS')}${nClauses ? ` · ${nClauses} ${L('придаточных/оборотов', 'clauses')}` : ''}${stStr ? ` (${stStr})` : ''}`;
  }
}

function applyAiToManual() {
  if (!currentAiIdeal) return;
  toks.forEach((k, i) => {
    const src = currentAiIdeal.toks[i];
    if (src) { k.p = src.p; k.s = src.s ? [...src.s] : []; }
  });
  const seenAn = new Set();
  const cleanAn = [];
  for (const a of (currentAiIdeal.an || [])) {
    const key = `${a.k}:${a.v}:${[...(a.ix || [])].sort((x, y) => x - y).join(',')}`;
    if (!seenAn.has(key)) {
      seenAn.add(key);
      cleanAn.push({ k: a.k, v: a.v, ix: [...a.ix], f: a.f });
    }
  }
  an = cleanAn;
  ST = [...currentAiIdeal.st];
  const firstPred = an.find(a => a.k === 'f');
  FS = firstPred && firstPred.f ? [...firstPred.f] : ['', '', '', ''];
  saveCurrentToHistory(false);
  switchTopMode('manual');
  const modeLbl = aiGranularity === 'macro' ? L('составной', 'macro') : L('детальный', 'detailed');
  msg(L(`Разбор от ИИ (${modeLbl}) применён к вашему ручному холсту!`, `AI parse (${modeLbl}) applied to manual canvas!`));
}

function exportAiCanvas(sc) {
  if (!currentAiIdeal) return null;
  const c = document.createElement('canvas');
  renderCustomSchema(c, currentAiIdeal.toks, currentAiIdeal.an, currentAiIdeal.st, sc, 3, aiLayers, true);
  return c;
}

function setupCanvasResizer(resizerId, wrapId) {
  const resizer = $(resizerId);
  const wrap = $(wrapId);
  if (!resizer || !wrap) return;

  let startY = 0;
  let startH = 0;
  let isDragging = false;

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientY === undefined) return;
    const dy = clientY - startY;
    const minH = 96;
    const maxH = Math.max(minH, window.innerHeight - 150);
    const newH = Math.max(minH, Math.min(maxH, Math.round(startH + dy)));

    const wrapMan = $('wrap');
    const wrapAi = $('wrap-ai');
    const containerMan = $('canvas-with-sidebar');
    if (wrapMan) wrapMan.style.height = `${newH}px`;
    if (wrapAi) wrapAi.style.height = `${newH}px`;
    if (containerMan) containerMan.style.height = `${newH}px`;
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('is-resizing-canvas');
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);

    const currentH = parseInt(wrap.style.height, 10);
    if (currentH && !isNaN(currentH)) {
      try { localStorage.setItem('foma_canvas_height', currentH); } catch (_) {}
      chrome.storage?.local?.set({ foma_canvas_height: currentH });
    }
  };

  const onPointerDown = (e) => {
    if (isFullHeight) {
      setFullHeight(false);
    }
    isDragging = true;
    startY = e.clientY ?? e.touches?.[0]?.clientY;
    startH = wrap.offsetHeight || 280;
    document.body.classList.add('is-resizing-canvas');

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
    e.preventDefault();
  };

  resizer.addEventListener('mousedown', onPointerDown);
  resizer.addEventListener('touchstart', onPointerDown, { passive: false });

  // Double click resets to standard 280px
  resizer.addEventListener('dblclick', () => {
    if (isFullHeight) setFullHeight(false);
    const defH = 280;
    const wrapMan = $('wrap');
    const wrapAi = $('wrap-ai');
    const containerMan = $('canvas-with-sidebar');
    if (wrapMan) wrapMan.style.height = `${defH}px`;
    if (wrapAi) wrapAi.style.height = `${defH}px`;
    if (containerMan) containerMan.style.height = `${defH}px`;
    try { localStorage.setItem('foma_canvas_height', defH); } catch (_) {}
    chrome.storage?.local?.set({ foma_canvas_height: defH });
    msg(L('Высота области схемы сброшена к стандартной (280px)', 'Canvas height reset to standard (280px)'));
  });
}

/* ══════════════════════════════════════════════════════════
   JSON Import from External LLM
   ══════════════════════════════════════════════════════════

   Converts the user-friendly word-matching JSON format:
     {"sentence_parts":[{"words":["is","passing"],"tag":"Predicate"}], …}
   into the internal index-based format and applies it to currentAiIdeal.

   Word matching strategy:
     1. Scan `toks[]` left-to-right.
     2. For each word in the user's "words" array, find the NEXT token whose
        `.t.toLowerCase()` matches (case-insensitive), tracking a cursor so
        repeated words resolve in order.
     3. Only `.word` tokens (not punctuation) are matched.
   ══════════════════════════════════════════════════════════ */

/** Resolve an array of word strings to token indices in toks[] order. */
function resolveWordsToIndices(words, startCursor = 0, excludeIndices = null) {
  if (!Array.isArray(words) || !words.length) return [];
  const result = [];
  let cursor = typeof startCursor === 'number' && startCursor >= 0 ? startCursor : 0;
  const isExcluded = (i) => excludeIndices && (excludeIndices instanceof Set ? excludeIndices.has(i) : excludeIndices.includes(i));

  for (const rawW of words) {
    const cleanW = String(rawW).trim();
    const lower = cleanW.toLowerCase();
    const stripped = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    let found = -1;

    // 1. Search forward from current cursor (preferring non-excluded tokens)
    for (let i = cursor; i < toks.length; i++) {
      if (toks[i].word && !result.includes(i)) {
        const tokenLower = toks[i].t.toLowerCase();
        if (tokenLower === lower || (stripped && tokenLower === stripped)) {
          if (!isExcluded(i)) {
            found = i;
            cursor = i + 1;
            break;
          } else if (found < 0) {
            found = i;
          }
        }
      }
    }

    // 2. Wrap-around fallback from index 0 if not found forward or if forward match was excluded
    if (found < 0 || isExcluded(found)) {
      for (let i = 0; i < cursor; i++) {
        if (toks[i].word && !result.includes(i)) {
          const tokenLower = toks[i].t.toLowerCase();
          if (tokenLower === lower || (stripped && tokenLower === stripped)) {
            if (!isExcluded(i)) {
              found = i;
              cursor = i + 1;
              break;
            } else if (found < 0) {
              found = i;
            }
          }
        }
      }
    }

    if (found >= 0) {
      result.push(found);
      cursor = Math.max(cursor, found + 1);
    }
  }
  return result;
}

/** Normalize sentence part tag to exact internal name (case-insensitive + common aliases). */
function normalizeSentencePartTag(tag) {
  if (!tag) return '';
  const clean = String(tag).trim();
  for (const [_, arr] of MG) {
    for (const [name] of arr) {
      if (name.toLowerCase() === clean.toLowerCase()) return name;
    }
  }
  const lower = clean.toLowerCase();
  if (lower.includes('predicative')) return 'Predicative';
  if (lower.includes('predicate')) return 'Predicate';
  if (lower.includes('subject')) return 'Subject';
  if (lower.includes('indirect') && lower.includes('object')) return 'Indirect object';
  if (lower.includes('direct') && lower.includes('object')) return 'Direct object';
  if (lower.includes('prepositional') && lower.includes('object')) return 'Prepositional object';
  if (lower.includes('attribute')) return 'Attribute';
  if (lower.includes('apposition')) return 'Apposition';
  if (lower.includes('introductory')) return 'Introductory element';
  if (lower.includes('address')) return 'Address';
  if (lower.includes('manner')) return 'AdvM manner';
  if (lower.includes('place')) return 'AdvM place';
  if (lower.includes('time')) return 'AdvM time';
  if (lower.includes('frequency')) return 'AdvM frequency';
  if (lower.includes('degree')) return 'AdvM degree';
  if (lower.includes('cause')) return 'AdvM cause';
  if (lower.includes('purpose')) return 'AdvM purpose';
  if (lower.includes('condition')) return 'AdvM condition';
  if (lower.includes('concession')) return 'AdvM concession';
  return clean;
}

/** Normalize clause/phrase tag to exact internal name. */
function normalizeClauseTag(tag) {
  if (!tag) return '';
  const clean = String(tag).trim();
  for (const [_, arr] of CG) {
    for (const name of arr) {
      if (name.toLowerCase() === clean.toLowerCase()) return name;
    }
  }
  const lower = clean.toLowerCase();
  if (lower.includes('gerund')) return 'Gerund phrase';
  if (lower.includes('infinitive')) return 'Infinitive phrase';
  if (lower.includes('participial')) return 'Participial phrase';
  if (lower.includes('prepositional phrase')) return 'Prepositional phrase';
  if (lower.includes('complex object')) return 'Complex object';
  if (lower.includes('complex subject')) return 'Complex subject';
  if (lower.includes('absolute')) return 'Absolute construction';
  if (lower.includes('noun phrase')) return 'Noun phrase';
  if (lower.includes('verb phrase')) return 'Verb phrase';
  if (lower.includes('main clause')) return 'Main clause';
  if (lower.includes('coordinate clause')) return 'Coordinate clause';
  if (lower.includes('subject clause')) return 'Subject clause';
  if (lower.includes('predicative clause')) return 'Predicative clause';
  if (lower.includes('object clause')) return 'Object clause';
  return clean;
}

/** POS name → internal POS key mapping (mirrors buildAiState POS_NORM + full names). */
const JSON_POS_MAP = {
  // full English names
  noun: 'n', nouns: 'n',
  pronoun: 'pron', pronouns: 'pron',
  adjective: 'adj', adjectives: 'adj',
  numeral: 'num', numerals: 'num', number: 'num',
  verb: 'v', verbs: 'v',
  adverb: 'adv', adverbs: 'adv',
  article: 'art', articles: 'art',
  preposition: 'prep', prepositions: 'prep',
  conjunction: 'conj', conjunctions: 'conj',
  particle: 'part', particles: 'part',
  interjection: 'int', interjections: 'int',
  determiner: 'det', determiners: 'det',
  // short codes (in case LLM returns them)
  n: 'n', pron: 'pron', adj: 'adj', num: 'num',
  v: 'v', adv: 'adv', art: 'art', prep: 'prep',
  conj: 'conj', part: 'part', int: 'int', det: 'det',
  // Russian names
  существительное: 'n', местоимение: 'pron', прилагательное: 'adj',
  числительное: 'num', глагол: 'v', наречие: 'adv', артикль: 'art',
  предлог: 'prep', союз: 'conj', частица: 'part', междометие: 'int', детерминатив: 'det'
};

/**
 * Convert the user's simple JSON format to the internal `ideal_parse` structure
 * used by buildAiState(), then apply it as currentAiIdeal.
 *
 * @param {string} jsonStr  Raw JSON string pasted by the user
 * @returns {{ ok: boolean, stats: object, error: string|null }}
 */
function importFromUserJson(jsonStr) {
  // ── 1. Parse JSON ──────────────────────────────────────────────────
  let data;
  try {
    // Strip markdown code fences
    const cleaned = jsonStr.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    data = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, stats: {}, error: `JSON синтаксис ошибка: ${e.message}` };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, stats: {}, error: 'JSON должен быть объектом, начинающимся с {…}.' };
  }

  // Auto-setup sentence text if sentence was included in JSON
  const jsonSentence = data.sentence || data.text;
  if (typeof jsonSentence === 'string' && jsonSentence.trim() && (!toks.length || !ta?.value?.trim())) {
    ta.value = jsonSentence.trim();
    parse();
  }

  if (!toks.length) {
    return { ok: false, stats: {}, error: 'Нет токенов. Введите предложение в поле "Edit sentence text" сначала.' };
  }

  // ── 2. Build ideal_parse in the internal index-based format ────────
  const stats = { parts: 0, clauses: 0, tenses: 0, pos: 0, missed: 0 };

  // === 2a. sentence_type → sentence_type (array of strings) ===
  const sentenceType = Array.isArray(data.sentence_type) ? data.sentence_type : [];

  // === 2b. part_of_speech → pos [[idx, posKey, [subtypes]], …] ===
  // === 2b. part_of_speech → pos [[idx, posKey, [subtypes]], …] ===
  const posMap = {}; // idx -> { p, s }
  const usedPosIndices = new Set();
  let posCursor = 0;

  if (Array.isArray(data.part_of_speech)) {
    for (const entry of data.part_of_speech) {
      const words = entry.words || entry.word ? (entry.words || [entry.word]) : [];
      const rawTag = (entry.tag || entry.pos || '').trim().toLowerCase();
      const posKey = JSON_POS_MAP[rawTag] || null;
      if (!posKey) continue;

      let indices = resolveWordsToIndices(words, posCursor, usedPosIndices);
      if (!indices.length && posCursor > 0) {
        indices = resolveWordsToIndices(words, 0, usedPosIndices);
      }
      for (const idx of indices) {
        if (!posMap[idx]) {
          posMap[idx] = { p: posKey, s: [] };
          usedPosIndices.add(idx);
          posCursor = Math.max(posCursor, idx + 1);
          stats.pos++;
        }
      }
    }
  }

  const posArray = Object.entries(posMap).map(([idx, v]) => [+idx, v.p, v.s]);

  // === 2c. sentence_parts → detailed_sentence_parts [{type, words:[idx]}, …] ===
  const detailedParts = [];
  const usedPartIndices = new Set();
  let partCursor = 0;

  if (Array.isArray(data.sentence_parts)) {
    for (const entry of data.sentence_parts) {
      const words = entry.words || [];
      const rawTag = entry.tag || '';
      const tag = normalizeSentencePartTag(rawTag);
      let indices = resolveWordsToIndices(words, partCursor, usedPartIndices);
      if (!indices.length && partCursor > 0) {
        indices = resolveWordsToIndices(words, 0, usedPartIndices);
      }
      if (tag && indices.length) {
        detailedParts.push({ type: tag, words: indices });
        indices.forEach(idx => usedPartIndices.add(idx));
        partCursor = Math.max(...indices) + 1;
        stats.parts++;
      } else if (rawTag && words.length) {
        stats.missed++;
      }
    }
  }

  // === 2d. clauses_and_phrases → clauses_phrases [{type, words:[idx]}, …] ===
  const clausesPhrases = [];
  const seenClauseKeys = new Set();
  let clauseCursor = 0;

  if (Array.isArray(data.clauses_and_phrases)) {
    for (const entry of data.clauses_and_phrases) {
      const words = entry.words || [];
      const rawTag = entry.tag || '';
      const tag = normalizeClauseTag(rawTag);
      let indices = resolveWordsToIndices(words, clauseCursor);
      if (!indices.length && clauseCursor > 0) {
        indices = resolveWordsToIndices(words, 0);
      }
      if (tag && indices.length) {
        const sortedIxKey = `${tag}::${[...indices].sort((a, b) => a - b).join(',')}`;
        if (!seenClauseKeys.has(sortedIxKey)) {
          seenClauseKeys.add(sortedIxKey);
          clausesPhrases.push({ type: tag, words: indices });
          clauseCursor = Math.min(...indices) + 1;
          stats.clauses++;
        }
      } else if (rawTag && words.length) {
        stats.missed++;
      }
    }
  }

  // === 2e. tense_voice_mood → tenses [{words:[idx], form:[…]}, …] ===
  const tenses = [];
  const usedTenseIndices = new Set();
  let tenseCursor = 0;

  if (Array.isArray(data.tense_voice_mood)) {
    for (const entry of data.tense_voice_mood) {
      const words = entry.words || [];
      const form = Array.isArray(entry.tags) ? entry.tags
                 : Array.isArray(entry.form) ? entry.form
                 : [];
      let indices = resolveWordsToIndices(words, tenseCursor, usedTenseIndices);
      if (!indices.length && tenseCursor > 0) {
        indices = resolveWordsToIndices(words, 0, usedTenseIndices);
      }
      if (form.length && indices.length) {
        const overlapsClaimed = indices.some(idx => usedTenseIndices.has(idx));
        if (!overlapsClaimed) {
          tenses.push({ words: indices, form });
          indices.forEach(idx => usedTenseIndices.add(idx));
          tenseCursor = Math.max(...indices) + 1;
          stats.tenses++;
        }
      }
    }
  }

  // ── 3. Compose ideal_parse object (internal index-based format) ────
  const idealParse = {
    sentence_type: sentenceType,
    pos: posArray,
    detailed_sentence_parts: detailedParts,
    macro_sentence_parts: detailedParts,
    clauses_phrases: clausesPhrases,
    tenses
  };

  // ── 4. Build AI state (reuses existing buildAiState logic) ─────────
  const newState = buildAiState(idealParse);
  if (!newState) {
    return { ok: false, stats, error: 'Не удалось построить схему разбора. Проверьте формат JSON.' };
  }

  // ── 5. Apply as currentAiIdeal ────────────────────────────────────
  currentAiIdeal = newState;
  lastAiFilledText = (ta?.value || '').trim();
  lastAiFilledModel = 'JSON Import';
  lastAiFilledLatency = null;
  lastAiVerdict = {
    summary: `Разбор импортирован из внешнего JSON (${stats.parts} членов пр., ${stats.clauses} оборотов, ${stats.tenses} форм глагола, ${stats.pos} частей речи).`
  };

  saveCurrentToHistory(false);
  renderAiCanvas();
  updateAiHeaderInfo();
  renderAiVerdictCard(lastAiVerdict);

  return { ok: true, stats, error: null };
}

/** LLM prompt that instructs ChatGPT/Gemini/Claude to output the user-friendly JSON format. */
function buildLlmPromptForUserJson() {
  const sentence = (ta?.value || '').trim();

  return `You are an expert English linguist. Parse the following sentence using the Russian academic grammar tradition (Barkhudarov / Kaushanskaya).

Sentence: "${sentence || '<paste your sentence here>'}"

Return ONLY a valid JSON object in exactly this format (no markdown, no explanation outside JSON):

{
  "sentence_type": ["<Structure: Simple|Compound|Complex|Compound-complex>", "<Purpose: Declarative|Interrogative|Imperative|Exclamatory>", "<Polarity: Affirmative|Negative>"],
  "sentence_parts": [
    {"words": ["<exact word tokens from the sentence>"], "tag": "<Subject|Predicate|Predicative|Direct object|Indirect object|Prepositional object|Attribute|Apposition|AdvM manner|AdvM place|AdvM time|AdvM frequency|AdvM degree|AdvM cause|AdvM purpose|AdvM condition|AdvM concession|Introductory element|Address>"}
  ],
  "clauses_and_phrases": [
    {"words": ["<exact word tokens>"], "tag": "<Main clause|Coordinate clause|Subject clause|Predicative clause|Object clause|Attributive clause (defining)|Attributive clause (non-defining)|AdvCl time|AdvCl place|AdvCl cause|AdvCl purpose|AdvCl condition|AdvCl concession|AdvCl manner|AdvCl result|AdvCl comparison|Prepositional phrase|Infinitive phrase|Gerund phrase|Participial phrase|Absolute construction|Complex object|Complex subject|Noun phrase|Verb phrase>"}
  ],
  "tense_voice_mood": [
    {"words": ["<predicate verb tokens>"], "tags": ["<Present|Past|Future>", "<Simple|Continuous|Perfect|Perfect Continuous>", "<Active|Passive>", "<Indicative|Imperative|Subjunctive|Conditional>"]}
  ],
  "part_of_speech": [
    {"words": ["<one or more word tokens>"], "tag": "<Noun|Pronoun|Adjective|Numeral|Verb|Adverb|Article|Preposition|Conjunction|Particle|Interjection|Determiner>"}
  ]
}

RULES:
- "words" must contain EXACT tokens from the sentence (case-sensitive as they appear).
- Repeated words resolve in order (left to right).
- In "sentence_parts" (detailed mode): Subject = nuclear noun/pronoun ONLY (no articles/adjectives). All modifiers = "Attribute".
- All fields are optional but include as many as possible for a complete parse.
- Sentence: "${sentence || '<your sentence>'}"`;
}

/* ──────────────────────────────────────────────────────────────────
   JSON Import Modal — setup event listeners
   ────────────────────────────────────────────────────────────────── */
let importSourceMode = 'manual'; // Tracks whether user triggered import from 'manual' or 'ai' view

function setupJsonImportModal() {
  const overlay = $('json-import-overlay');
  const taImport = $('json-import-ta');
  const errBox = $('json-import-error');
  const statsBox = $('json-import-stats');

  if (!overlay) return;

  const openModal = () => {
    overlay.style.display = 'flex';
    if (taImport) taImport.focus();
    hideImportFeedback();
  };

  const closeModal = () => {
    overlay.style.display = 'none';
  };

  function showImportError(text) {
    if (errBox) { errBox.textContent = text; errBox.style.display = 'block'; }
    if (statsBox) statsBox.style.display = 'none';
  }

  function showImportStats(stats) {
    if (errBox) errBox.style.display = 'none';
    if (statsBox) {
      const missed = stats.missed ? `<span class="json-import-stat-pill" style="color:#b45309;">${stats.missed} слов не найдено в предложении</span>` : '';
      statsBox.innerHTML = [
        `<span class="json-import-stat-pill">Применено:</span>`,
        stats.parts ? `<span class="json-import-stat-pill">${stats.parts} членов предложения</span>` : '',
        stats.clauses ? `<span class="json-import-stat-pill">${stats.clauses} оборотов/придаточных</span>` : '',
        stats.tenses ? `<span class="json-import-stat-pill">${stats.tenses} форм глагола</span>` : '',
        stats.pos ? `<span class="json-import-stat-pill">${stats.pos} частей речи</span>` : '',
        missed
      ].filter(Boolean).join('');
      statsBox.style.display = 'flex';
    }
  }

  function hideImportFeedback() {
    if (errBox) errBox.style.display = 'none';
    if (statsBox) statsBox.style.display = 'none';
  }

  // Open button in Manual view (replaces Check with AI)
  $('btn-json-import')?.addEventListener('click', () => {
    importSourceMode = 'manual';
    openModal();
  });

  // Open button in AI view toolbar
  $('btn-json-import-ai')?.addEventListener('click', () => {
    importSourceMode = 'ai';
    openModal();
  });

  // Close buttons
  $('json-import-close')?.addEventListener('click', closeModal);
  $('btn-json-cancel')?.addEventListener('click', closeModal);

  // Click outside dialog to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal();
  });

  // Clear button
  $('btn-json-clear')?.addEventListener('click', () => {
    if (taImport) taImport.value = '';
    hideImportFeedback();
    taImport?.focus();
  });

  // Copy LLM prompt button
  $('btn-json-copy-prompt')?.addEventListener('click', () => {
    const prompt = buildLlmPromptForUserJson();
    const btn = $('btn-json-copy-prompt');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        if (btn) { const orig = btn.textContent; btn.textContent = 'Скопировано!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
      }).catch(() => copyTextViaExecCommand(prompt));
    } else {
      copyTextViaExecCommand(prompt);
      if (btn) { const orig = btn.textContent; btn.textContent = 'Скопировано!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
    }
    msg(L('Промпт для LLM скопирован в буфер обмена!', 'LLM prompt copied to clipboard!'));
  });

  // Apply button
  $('btn-json-apply')?.addEventListener('click', () => {
    const raw = taImport?.value?.trim() || '';
    if (!raw) {
      showImportError('Поле пустое. Вставьте JSON-разбор от ChatGPT / Gemini / Claude.');
      return;
    }

    const result = importFromUserJson(raw);

    if (!result.ok) {
      showImportError(result.error || 'Неизвестная ошибка при разборе JSON.');
      return;
    }

    showImportStats(result.stats);

    // If opened from manual view, apply directly to user's canvas!
    if (importSourceMode === 'manual') {
      applyAiToManual();
      msg(L('JSON-разбор применён к вашему разбору!', 'JSON parse applied to manual canvas!'));
    } else {
      switchTopMode('ai');
      msg(L('JSON-разбор применён к схеме ИИ!', 'JSON parse applied to AI schema!'));
    }

    // Auto-close after brief delay so user sees stats
    setTimeout(() => {
      closeModal();
    }, 1200);
  });
}

function setupTopModeEvents() {
  $('tab-nav-manual')?.addEventListener('click', () => switchTopMode('manual'));
  $('tab-nav-ai')?.addEventListener('click', () => switchTopMode('ai'));

  $('btn-ai-toggle-height')?.addEventListener('click', () => setFullHeight(!isFullHeight));
  $('btn-manual-toggle-height')?.addEventListener('click', () => setFullHeight(!isFullHeight));

  setupCanvasResizer('canvas-resizer', 'wrap');
  setupCanvasResizer('canvas-resizer-ai', 'wrap-ai');

  setupLayerFilterToolbar();
  setupSidebarEvents();
  setupWordHoverTooltip();
  updateSidebarPalette();
  updateProgressBar();
  $('btn-render-color')?.classList.toggle('active', renderMode === 'color_focus');
  $('btn-render-bw')?.classList.toggle('active', renderMode === 'bw');

  // Model Combo Trigger & Popover
  const modelTrigger = $('model-trigger');
  const modelPopover = $('model-popover');
  if (modelTrigger && modelPopover) {
    modelTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = modelPopover.classList.contains('hidden');
      if (isHidden) {
        modelPopover.classList.remove('hidden');
        modelTrigger.setAttribute('aria-expanded', 'true');
      } else {
        modelPopover.classList.add('hidden');
        modelTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('click', (e) => {
      if (!modelPopover.classList.contains('hidden') && !modelPopover.contains(e.target) && !modelTrigger.contains(e.target)) {
        modelPopover.classList.add('hidden');
        modelTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modelPopover.classList.contains('hidden')) {
        modelPopover.classList.add('hidden');
        modelTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // API Key toggle inside popover
  $('btn-api-key')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const bar = $('ai-key-inline-bar');
    if (bar) {
      const isHidden = bar.style.display === 'none' || getComputedStyle(bar).display === 'none';
      bar.style.display = isHidden ? 'flex' : 'none';
    }
  });

  // Layer filter chips in Row 2
  document.querySelectorAll('#ai-layer-filters .foma-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const layerId = chip.getAttribute('data-layer');
      if (layerId) toggleAiLayer(layerId);
    });
  });

  // Hotkeys 1-5 for layers
  document.addEventListener('keydown', (e) => {
    if (currentTopMode !== 'ai') return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const keyMap = {
      '1': 'pos',
      '2': 'parts',
      '3': 'clauses',
      '4': 'tenses',
      '5': 'st'
    };
    if (keyMap[e.key]) {
      e.preventDefault();
      toggleAiLayer(keyMap[e.key]);
    }
  });

  // Copy sentence text button in AI verdict card
  $('btn-ai-copy-text')?.addEventListener('click', () => {
    const text = (ta?.value || '').trim();
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        msg(L('Текст предложения скопирован!', 'Sentence text copied!'));
      }).catch(() => {
        copyTextViaExecCommand(text);
        msg(L('Текст предложения скопирован!', 'Sentence text copied!'));
      });
    } else {
      copyTextViaExecCommand(text);
      msg(L('Текст предложения скопирован!', 'Sentence text copied!'));
    }
  });

  // TIPS button
  $('btn-tips')?.addEventListener('click', () => {
    msg(L('Горячие клавиши: 1-5 — слои разбора, F4 / Alt+S — открыть парсер, Del — сбросить отметки', 'Shortcuts: 1-5 — parse layers, F4 / Alt+S — open parser, Del — remove marks'));
  });

  // Theme Toggle button
  $('btn-theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
  });

  $('sel-ai-provider')?.addEventListener('change', () => {
    const prov = $('sel-ai-provider').value;
    AI.provider = prov;
    const models = AI.models[prov] || PROVIDERS[prov]?.models || [];
    AI.activeModel[prov] = models[0] || PROVIDERS[prov]?.defaultModel;
    chrome.storage?.local?.set({ aiprovider: AI.provider, aiactivemodels: AI.activeModel });
    syncAiSelectors();
    updateAiHeaderInfo();
  });

  $('sel-ai-model')?.addEventListener('change', () => {
    const prov = AI.provider || 'positionapi';
    const m = $('sel-ai-model').value;
    if (m) {
      AI.activeModel[prov] = m;
      chrome.storage?.local?.set({ aiactivemodels: AI.activeModel });
      updateAiHeaderInfo();
    }
  });

  $('btn-ai-run')?.addEventListener('click', () => runAiDirectFill());
  $('btn-gran-detailed')?.addEventListener('click', () => setAiGranularity('detailed'));
  $('btn-gran-macro')?.addEventListener('click', () => setAiGranularity('macro'));
  $('btn-ai-copy-img')?.addEventListener('click', () => copyImage());
  $('btn-ai-apply-manual')?.addEventListener('click', () => applyAiToManual());
  $('btn-ai-retry')?.addEventListener('click', () => runAiDirectFill());

  $('btn-ai-save-inline-key')?.addEventListener('click', () => {
    const inp = $('ai-key-inline-input');
    const val = (inp?.value || '').trim();
    if (!val) return;
    const prov = AI.provider || 'positionapi';
    AI.keys[prov] = val;
    chrome.storage?.local?.set({ aikeys: AI.keys }, () => {
      msg(L(`Ключ сохранён для ${PROVIDERS[prov]?.name || prov}!`, `Key saved for ${PROVIDERS[prov]?.name || prov}!`));
      if (inp) inp.value = '';
      updateAiKeyInlineBar();
      runAiDirectFill();
    });
  });

  $('btn-ai-open-settings')?.addEventListener('click', () => {
    switchTopMode('manual');
    tab = 'ai';
    ui();
    const el = $('sec-ai');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });
}

$('all').onclick = () => {
  if (!confirm(L('Стереть всю разметку текущего предложения?', 'Clear all markings for current sentence?'))) return;
  toks.forEach(k => { k.p = null; k.s = null; });
  an = [];
  ST = ['', '', '', ''];
  FS = ['', '', '', ''];
  saveCurrentToHistory(false);
  render();
  ui();
  updateProgressBar();
};

// ── 100% Invariant Auto-Tagger Rule Engine ───────────────────────────────
function saveAuto100Rules() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ foma_auto_100_rules: auto100Rules });
  } else {
    try {
      localStorage.setItem('foma_auto_100_rules', JSON.stringify(auto100Rules));
    } catch (_) {}
  }
}

function runAuto100Tagger(rules = auto100Rules) {
  if (!toks || !toks.length) return 0;
  let taggedCount = 0;

  // 1. Articles (100% invariant)
  if (rules.articles) {
    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (lower === 'a' || lower === 'an') {
          k.p = 'art';
          k.s = ['indefinite'];
          taggedCount++;
        } else if (lower === 'the') {
          k.p = 'art';
          k.s = ['definite'];
          taggedCount++;
        }
      }
    });
  }

  // 2. Invariable Pronouns & Cases (100% invariant)
  if (rules.pronouns_cases) {
    const NOM_PRONS = {
      'i': ['personal', 'nominative'],
      'he': ['personal', 'nominative'],
      'she': ['personal', 'nominative'],
      'we': ['personal', 'nominative'],
      'they': ['personal', 'nominative']
    };
    const OBJ_PRONS = {
      'me': ['personal', 'objective'],
      'him': ['personal', 'objective'],
      'us': ['personal', 'objective'],
      'them': ['personal', 'objective']
    };
    const REFL_PRONS = new Set([
      'myself', 'yourself', 'himself', 'herself', 'itself',
      'ourselves', 'yourselves', 'themselves'
    ]);
    const ABS_POSS = new Set(['mine', 'yours', 'hers', 'ours', 'theirs']);
    const CONJ_POSS = new Set(['my', 'our', 'their']);
    const INDEF_PRONS = new Set(['someone', 'somebody', 'something', 'anyone', 'anybody', 'anything']);
    const DEF_PRONS = new Set(['everyone', 'everybody', 'everything']);
    const NEG_PRONS = new Set(['nobody', 'nothing']);

    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (NOM_PRONS[lower]) {
          k.p = 'pron';
          k.s = [...NOM_PRONS[lower]];
          taggedCount++;
        } else if (OBJ_PRONS[lower]) {
          k.p = 'pron';
          k.s = [...OBJ_PRONS[lower]];
          taggedCount++;
        } else if (REFL_PRONS.has(lower)) {
          k.p = 'pron';
          k.s = ['reflexive'];
          taggedCount++;
        } else if (ABS_POSS.has(lower)) {
          k.p = 'pron';
          k.s = ['possessive', 'absolute'];
          taggedCount++;
        } else if (CONJ_POSS.has(lower)) {
          k.p = 'pron';
          k.s = ['possessive', 'conjoint'];
          taggedCount++;
        } else if (INDEF_PRONS.has(lower)) {
          k.p = 'pron';
          k.s = ['indefinite'];
          taggedCount++;
        } else if (DEF_PRONS.has(lower)) {
          k.p = 'pron';
          k.s = ['defining'];
          taggedCount++;
        } else if (NEG_PRONS.has(lower)) {
          k.p = 'pron';
          k.s = ['negative'];
          taggedCount++;
        }
      }
    });
  }

  // 3. Numerals (100% invariant)
  if (rules.numerals) {
    const CARDINALS = new Set([
      'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
      'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
      'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion'
    ]);
    const ORDINALS = new Set([
      'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
      'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth',
      'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'thirtieth', 'fortieth',
      'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth', 'hundredth', 'thousandth'
    ]);

    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (/^\d+$/.test(k.t)) {
          k.p = 'num';
          k.s = ['cardinal'];
          taggedCount++;
        } else if (/^\d+(st|nd|rd|th)$/i.test(k.t)) {
          k.p = 'num';
          k.s = ['ordinal'];
          taggedCount++;
        } else if (CARDINALS.has(lower)) {
          k.p = 'num';
          k.s = ['cardinal'];
          taggedCount++;
        } else if (ORDINALS.has(lower)) {
          k.p = 'num';
          k.s = ['ordinal'];
          taggedCount++;
        }
      }
    });
  }

  // 4. Calendar Proper Nouns (100% invariant)
  if (rules.calendar_proper) {
    const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    const MONTHS = new Set([
      'january', 'february', 'april', 'june', 'july', 'august',
      'september', 'october', 'november', 'december'
    ]); // 'march' and 'may' intentionally excluded for 100% invariance

    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (DAYS.has(lower) || MONTHS.has(lower)) {
          k.p = 'n';
          k.s = ['proper', 'singular', 'concrete'];
          taggedCount++;
        }
      }
    });
  }

  // 5. Particles & Invariable Conjunctions (100% invariant)
  if (rules.particles_conj) {
    toks.forEach(k => {
      if (!k.p) {
        const lower = k.t.toLowerCase();
        if (lower === 'not' || lower === "n't" || lower === 'n’t') {
          k.p = 'part';
          k.s = ['negative'];
          taggedCount++;
        } else if (lower === 'and' || lower === 'nor') {
          k.p = 'conj';
          k.s = ['coordinating'];
          taggedCount++;
        } else if (lower === 'because' || lower === 'although' || lower === 'whereas' || lower === 'unless') {
          k.p = 'conj';
          k.s = ['subordinating'];
          taggedCount++;
        }
      }
    });
  }

  // 6. Pure Prepositions (100% invariant - never adverbs or conjunctions)
  if (rules.pure_prepositions) {
    const PURE_PREPS = new Set([
      'of', 'into', 'onto', 'upon', 'among', 'amongst', 'between',
      'during', 'toward', 'towards', 'throughout', 'against'
    ]);
    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (PURE_PREPS.has(lower)) {
          k.p = 'prep';
          k.s = [];
          taggedCount++;
        }
      }
    });
  }

  // 7. Modals without homonyms (100% invariant)
  if (rules.modals) {
    const PURE_MODALS = new Set(['must', 'should', 'would', 'could', 'ought']);
    toks.forEach(k => {
      if (k.word && !k.p) {
        const lower = k.t.toLowerCase();
        if (PURE_MODALS.has(lower)) {
          k.p = 'v';
          k.s = ['modal'];
          taggedCount++;
        }
      }
    });
  }

  // 8. Sentence Purpose from Punctuation (100% invariant)
  if (rules.sentence_purpose) {
    let lastPunct = '';
    for (let i = toks.length - 1; i >= 0; i--) {
      if (!toks[i].word) {
        const t = toks[i].t.trim();
        if (t === '!' || t === '?' || t === '.' || t.includes('!') || t.includes('?')) {
          lastPunct = t;
          break;
        }
      }
    }
    if (lastPunct.includes('!')) {
      if (!ST[1]) { ST[1] = 'Exclamatory'; taggedCount++; }
    } else if (lastPunct.includes('?')) {
      if (!ST[1]) { ST[1] = 'Interrogative'; taggedCount++; }
      const firstWord = toks.find(k => k.word)?.t.toLowerCase();
      const WH_WORDS = new Set(['what', 'where', 'when', 'why', 'who', 'whom', 'whose', 'which', 'how']);
      if (WH_WORDS.has(firstWord) && !ST[2]) {
        ST[2] = 'Special';
        taggedCount++;
      }
    } else if (lastPunct === '.') {
      if (!ST[1]) { ST[1] = 'Declarative'; taggedCount++; }
    }
  }

  // 9. Sentence Polarity (100% invariant)
  if (rules.sentence_polarity) {
    const NEG_MARKERS = new Set(['not', "n't", 'n’t', 'never', 'nobody', 'no-one', 'nothing', 'nowhere', 'neither', 'none']);
    const hasNeg = toks.some(k => NEG_MARKERS.has(k.t.toLowerCase()));
    if (!ST[3]) {
      ST[3] = hasNeg ? 'Negative' : 'Affirmative';
      taggedCount++;
    }
  }

  // 10. Passive Voice detection (100% invariant: be + V3/Ved)
  if (rules.passive_voice) {
    const BE_FORMS = new Set(['be', 'been', 'being', 'am', 'is', 'are', 'was', 'were', "'m", "'s", "'re", '’m', '’s', '’re']);
    const IRREG_V3 = new Set([
      'done', 'seen', 'taken', 'written', 'broken', 'chosen', 'given', 'driven', 'eaten',
      'spoken', 'known', 'grown', 'thrown', 'shown', 'built', 'made', 'found', 'kept',
      'told', 'felt', 'left', 'brought', 'thought', 'bought', 'taught', 'caught', 'paid',
      'said', 'sold', 'sent', 'spent', 'held', 'heard', 'understood', 'met', 'read',
      'set', 'put', 'cut', 'hit', 'hurt', 'let', 'shut', 'cost', 'lost', 'won', 'run'
    ]);

    for (let i = 0; i < toks.length - 1; i++) {
      if (!toks[i].word) continue;
      const lower = toks[i].t.toLowerCase();
      if (BE_FORMS.has(lower)) {
        let nextIdx = i + 1;
        while (nextIdx < toks.length && !toks[nextIdx].word) nextIdx++;
        if (nextIdx < toks.length) {
          const nextWord = toks[nextIdx].t.toLowerCase();
          const isV3 = (nextWord.endsWith('ed') && nextWord.length >= 4) || IRREG_V3.has(nextWord);
          if (isV3) {
            const alreadyHasPassive = an.some(a => a.k === 'f' && a.ix.includes(nextIdx) && (a.v?.includes('Passive') || a.f?.includes('Passive')));
            if (!alreadyHasPassive) {
              const span = [i, nextIdx];
              const existingF = an.find(a => a.k === 'f' && a.ix.includes(nextIdx));
              if (existingF) {
                if (!existingF.v?.includes('Passive')) existingF.v = (existingF.v + ' Passive').trim();
                if (!existingF.f) existingF.f = [];
                if (!existingF.f.includes('Passive')) existingF.f.push('Passive');
              } else {
                an.push({ k: 'f', v: 'Passive', ix: span, f: ['Passive'] });
              }
              if (!FS[2]) FS[2] = 'Passive';
              taggedCount++;
            }
          }
        }
      }
    }
  }

  // 11. Subject for Nominative Pronouns (100% invariant)
  if (rules.subject_pronouns) {
    const NOM_SUBJECTS = new Set(['i', 'he', 'she', 'we', 'they']);
    for (let i = 0; i < toks.length; i++) {
      if (!toks[i].word) continue;
      const lower = toks[i].t.toLowerCase();
      if (NOM_SUBJECTS.has(lower)) {
        let nextIdx = i + 1;
        while (nextIdx < toks.length && !toks[nextIdx].word) nextIdx++;
        if (nextIdx < toks.length) {
          const nextLower = toks[nextIdx].t.toLowerCase();
          const isVerb = ['rises', 'shouts', 'want', 'wants', 'wanted', 'said', 'saw', 'is', 'was', 'are', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'must'].includes(nextLower)
            || nextLower.endsWith('ed') || (nextLower.endsWith('s') && !nextLower.endsWith('ss'));
          if (isVerb) {
            const alreadySubject = an.some(a => a.k === 'm' && a.ix.includes(i));
            if (!alreadySubject) {
              an.push({ k: 'm', v: 'Subject', ix: [i] });
              taggedCount++;
            }
          }
        }
      }
    }
    sanitizeSentenceParts();
  }

  // 12. Address / Vocative (100% invariant)
  if (rules.address_vocative) {
    for (let i = 0; i < toks.length - 2; i++) {
      const isStart = i === 0 || (i === 1 && !toks[0].word);
      const isQuoteStart = i > 0 && !toks[i - 1].word && /["“«'‘]/.test(toks[i - 1].t);
      if ((isStart || isQuoteStart) && toks[i].word) {
        if (toks[i + 1] && !toks[i + 1].word && toks[i + 1].t === ',') {
          let clauseIdx = i + 2;
          while (clauseIdx < toks.length && !toks[clauseIdx].word) clauseIdx++;
          if (clauseIdx < toks.length) {
            const clauseWord = toks[clauseIdx].t.toLowerCase();
            if (['it', 'i', 'you', 'we', 'he', 'she', 'they', 'there', 'this', 'that'].includes(clauseWord)) {
              const alreadyHasM = an.some(a => a.k === 'm' && a.ix.includes(i));
              if (!alreadyHasM) {
                an.push({ k: 'm', v: 'Address', ix: [i] });
                taggedCount++;
              }
            }
          }
        }
      }
    }
    sanitizeSentenceParts();
  }

  return taggedCount;
}

function setupAuto100ConfigModal() {
  const overlay = $('auto-config-overlay');
  if (!overlay) return;

  const ruleKeys = Object.keys(DEFAULT_AUTO_100_RULES);

  function syncCheckboxesFromState() {
    ruleKeys.forEach(k => {
      const cb = $(`auto-cfg-${k}`);
      if (cb) cb.checked = !!auto100Rules[k];
    });
  }

  function syncStateFromCheckboxes() {
    ruleKeys.forEach(k => {
      const cb = $(`auto-cfg-${k}`);
      if (cb) auto100Rules[k] = cb.checked;
    });
    saveAuto100Rules();
  }

  function openModal() {
    syncCheckboxesFromState();
    overlay.style.display = 'flex';
  }

  function closeModal() {
    overlay.style.display = 'none';
  }

  // Bind Open & Close buttons
  $('btn-auto-config')?.addEventListener('click', openModal);
  $('auto-config-close')?.addEventListener('click', closeModal);
  $('btn-auto-config-close')?.addEventListener('click', closeModal);

  // Click outside to close
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Escape key to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal();
  });

  // Checkbox changes save immediately
  ruleKeys.forEach(k => {
    const cb = $(`auto-cfg-${k}`);
    if (cb) {
      cb.addEventListener('change', () => {
        auto100Rules[k] = cb.checked;
        saveAuto100Rules();
      });
    }
  });

  // Preset buttons
  document.querySelectorAll('.btn-auto-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      if (p === 'all') {
        ruleKeys.forEach(k => auto100Rules[k] = true);
      } else if (p === 'pos_only') {
        ruleKeys.forEach(k => {
          auto100Rules[k] = ['articles', 'pronouns_cases', 'numerals', 'calendar_proper', 'particles_conj', 'pure_prepositions', 'modals'].includes(k);
        });
      } else if (p === 'func_only') {
        ruleKeys.forEach(k => {
          auto100Rules[k] = ['articles', 'particles_conj', 'pure_prepositions', 'modals'].includes(k);
        });
      } else if (p === 'clear') {
        ruleKeys.forEach(k => auto100Rules[k] = false);
      }
      syncCheckboxesFromState();
      saveAuto100Rules();
    });
  });

  // Apply now button inside modal
  $('btn-auto-config-apply')?.addEventListener('click', () => {
    syncStateFromCheckboxes();
    const count = runAuto100Tagger(auto100Rules);
    if (count > 0) saveCurrentToHistory(false);
    render();
    ui();
    msg(count ? L(`Авторасстановка: размечено ${count} элементов со 100% уверенностью.`, `Auto-tagged ${count} elements with 100% confidence.`) : L('Все выбранные 100% параметры уже размечены.', 'All selected 100% parameters are already tagged.'));
    closeModal();
  });
}

function setShowWordPopover(val) {
  showWordPopover = Boolean(val);
  try {
    localStorage.setItem('foma_show_word_popover', showWordPopover ? '1' : '0');
    chrome.storage?.local?.set({ foma_show_word_popover: showWordPopover });
  } catch (_) {}
  updateWordPopover();
}

function setShowProgressBar(val) {
  showProgressBar = Boolean(val);
  try {
    localStorage.setItem('foma_show_progress_bar', showProgressBar ? '1' : '0');
    chrome.storage?.local?.set({ foma_show_progress_bar: showProgressBar });
  } catch (_) {}
  const bar = $('top-progress-bar');
  if (bar) bar.style.display = showProgressBar ? '' : 'none';
  if (showProgressBar) updateProgressBar();
}

function setWordPopoverLayout(layout) {
  if (layout !== 'column' && layout !== 'row') return;
  wordPopoverLayout = layout;
  try {
    localStorage.setItem('foma_word_popover_layout', wordPopoverLayout);
    chrome.storage?.local?.set({ foma_word_popover_layout: wordPopoverLayout });
  } catch (_) {}
  const popover = $('word-selection-popover');
  if (popover) {
    popover.classList.toggle('layout-column', wordPopoverLayout === 'column');
  }
  updateWordPopover();
}

function setPartsFormat(format) {
  if (!['combo', 'full', 'short', 'symbols_only'].includes(format)) return;
  partsFormat = format;
  try {
    localStorage.setItem('foma_parts_format', partsFormat);
    chrome.storage?.local?.set({ foma_parts_format: partsFormat });
  } catch (_) {}
  render();
  if (currentTopMode === 'ai') renderAiCanvas();
}

function setupSettingsModal() {
  const overlay = $('settings-overlay');
  if (!overlay) return;

  function syncControlsFromState() {
    const radio = document.querySelector(`input[name="cfg-parts-format"][value="${partsFormat}"]`);
    if (radio) radio.checked = true;
    const popToggle = $('cfg-show-word-popover');
    if (popToggle) popToggle.checked = Boolean(showWordPopover);
    const progToggle = $('cfg-show-progress-bar');
    if (progToggle) progToggle.checked = Boolean(showProgressBar);
    const isCol = wordPopoverLayout === 'column';
    $('btn-layout-row')?.classList.toggle('active', !isCol);
    $('btn-layout-col')?.classList.toggle('active', isCol);
  }

  function openModal() {
    syncControlsFromState();
    overlay.style.display = 'flex';
  }

  function closeModal() {
    overlay.style.display = 'none';
  }

  $('btn-settings')?.addEventListener('click', openModal);
  $('btn-sidebar-settings')?.addEventListener('click', openModal);
  $('btn-settings-close')?.addEventListener('click', closeModal);
  $('btn-settings-done')?.addEventListener('click', closeModal);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') {
      closeModal();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      if (overlay.style.display !== 'none') closeModal();
      else openModal();
    }
  });

  document.querySelectorAll('input[name="cfg-parts-format"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setPartsFormat(radio.value);
      }
    });
  });

  $('cfg-show-word-popover')?.addEventListener('change', e => {
    setShowWordPopover(e.target.checked);
  });

  $('cfg-show-progress-bar')?.addEventListener('change', e => {
    setShowProgressBar(e.target.checked);
  });

  $('btn-layout-row')?.addEventListener('click', () => {
    setWordPopoverLayout('row');
    syncControlsFromState();
  });

  $('btn-layout-col')?.addEventListener('click', () => {
    setWordPopoverLayout('column');
    syncControlsFromState();
  });
}

$('auto').onclick = () => {
  const count = runAuto100Tagger(auto100Rules);
  if (count > 0) saveCurrentToHistory(false);
  render();
  ui();
  msg(count ? L(`Авторасстановка: размечено ${count} элементов со 100% уверенностью.`, `Auto-tagged ${count} elements with 100% confidence.`) : L('Все выбранные 100% параметры уже размечены.', 'All selected 100% parameters are already tagged.'));
};

$('sc').onchange = () => {
  saveCurrentToHistory(false);
  if (currentTopMode === 'ai') {
    renderAiCanvas();
  } else {
    render();
  }
  chrome.storage?.local?.set({ scale: $('sc').value });
};

$('restr').onchange = ui;

// Toggle edit sentence text panel via toolbar button and close button
function toggleEditPanel(show) {
  const ed = $('ed');
  const btn = $('btn-toggle-edit');
  if (!ed) return;
  const isCurrentlyOpen = !ed.classList.contains('collapsed') && ed.style.display !== 'none';
  const nextState = (typeof show === 'boolean') ? show : !isCurrentlyOpen;

  if (nextState) {
    ed.classList.remove('collapsed');
    ed.style.display = '';
    if (btn) {
      btn.classList.add('on');
      btn.setAttribute('aria-expanded', 'true');
      const lbl = btn.querySelector('#lbl-btn-edit-text') || btn;
      lbl.textContent = L('Скрыть текст', 'Hide text');
      btn.title = L('Скрыть поле редактирования текста', 'Hide text editing field');
    }
    ta.focus();
  } else {
    ed.classList.add('collapsed');
    ed.style.display = 'none';
    if (btn) {
      btn.classList.remove('on');
      btn.setAttribute('aria-expanded', 'false');
      const lbl = btn.querySelector('#lbl-btn-edit-text') || btn;
      lbl.textContent = L('Редактировать текст', 'Edit text');
      btn.title = L('Редактировать текст предложения (показать / скрыть поле)', 'Edit sentence text (show / hide field)');
    }
  }

  try {
    localStorage.setItem('foma_edit_panel_open', nextState ? '1' : '0');
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ foma_edit_panel_open: nextState });
    }
  } catch (_) {}
}

const btnToggleEdit = $('btn-toggle-edit');
if (btnToggleEdit) {
  btnToggleEdit.addEventListener('click', () => toggleEditPanel());
}

const btnCloseEdit = $('btn-close-edit');
if (btnCloseEdit) {
  btnCloseEdit.addEventListener('click', () => toggleEditPanel(false));
}

// Expand sentence textarea on focus / click, shrink back on blur
const edLbl = document.querySelector('.edit .lbl');
if (edLbl) {
  edLbl.addEventListener('click', (e) => {
    if (e.target.id === 'trb' || e.target.id === 'btn-close-edit' || e.target.closest('#btn-close-edit')) return;
    ta.focus();
  });
}

function autoResizeTa(expanded) {
  if (expanded) {
    $('ed')?.classList.add('active');
    ta.classList.add('expanded');
    ta.style.height = Math.max(115, Math.min(260, ta.scrollHeight)) + 'px';
  } else {
    $('ed')?.classList.remove('active');
    ta.classList.remove('expanded');
    ta.style.height = '';
  }
}

ta.addEventListener('focus', () => autoResizeTa(true));
ta.addEventListener('blur', () => autoResizeTa(false));
ta.addEventListener('input', () => {
  if (ta.classList.contains('expanded')) {
    ta.style.height = Math.max(115, Math.min(260, ta.scrollHeight)) + 'px';
  }
  currentAiIdeal = null;
  lastAiFilledText = '';
  lastAiFilledModel = '';
  lastAiFilledLatency = null;
  lastAiVerdict = null;
  updateAiHeaderInfo();

  parse();
  render();
  ui();
  saveCurrentToHistory(false);
});

/* ---------- selection ---------- */
const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const hitW = e => { const [x, y] = pt(e); return toks.findIndex(k => { const L = Ls[k.line]; return k.word && x >= k.x - 3 && x <= k.x + k.w + 3 && y >= L.y + L.ca && y <= L.b + 10; }); };
const hitA = e => { const [x, y] = pt(e); return hits.find(h => x >= h.x1 && x <= h.x2 && y >= h.y1 && y <= h.y2); };
const rng = (a, b) => toks.map((k, n) => n).filter(n => n >= Math.min(a, b) && n <= Math.max(a, b) && toks[n].word);

let ds = -1;
cv.addEventListener('mousedown', e => { ds = hitW(e); });
cv.addEventListener('mouseup', e => {
  const i = hitW(e), add = $('multi').checked || e.ctrlKey || e.metaKey;
  if (i < 0) {
    const h = hitA(e);
    if (h) { sel = sorted(h.a); anc = sel[0]; last = sel[sel.length - 1]; }
    else if (!add) sel = [];
    return selChanged();
  }
  if (ds >= 0 && ds !== i) { sel = rng(ds, i); anc = ds; }
  else if (e.shiftKey && anc >= 0) sel = rng(anc, i);
  else if (add) { sel = sel.includes(i) ? sel.filter(n => n !== i) : [...sel, i]; anc = i; }
  else { sel = (sel.length === 1 && sel[0] === i) ? [] : [i]; anc = i; }
  last = i;
  selChanged();
});

function step(d, ext) {
  const w = toks.map((k, i) => i).filter(i => toks[i].word);
  if (!w.length) return;
  let p = w.indexOf(last);
  p = p < 0 ? 0 : Math.min(w.length - 1, Math.max(0, p + d));
  last = w[p];
  if (ext && anc >= 0) sel = rng(anc, last);
  else { anc = last; sel = [last]; }
  selChanged();
}

function getSelectedText() {
  if (!sel || !sel.length) return '';
  const sortedSel = [...sel].sort((a, b) => a - b);
  const min = sortedSel[0];
  const max = sortedSel[sortedSel.length - 1];

  let isContiguous = true;
  for (let i = min; i <= max; i++) {
    if (toks[i]?.word && !sortedSel.includes(i)) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous) {
    let str = '';
    for (let i = min; i <= max; i++) {
      if (i > min && toks[i].sp) str += ' ';
      str += toks[i].t;
    }
    return str;
  }
  return sortedSel.map(i => toks[i]?.t).filter(Boolean).join(' ');
}

function copyTextToClipboard(text) {
  if (!text) return;
  try {
    window.parent?.postMessage({ action: 'foma_parser_copy_text', text }, '*');
  } catch (_) {}

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      copyTextViaExecCommand(text);
    });
  } else {
    copyTextViaExecCommand(text);
  }
}

function copyTextViaExecCommand(text) {
  try {
    const taHidden = document.createElement('textarea');
    taHidden.value = text;
    taHidden.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(taHidden);
    taHidden.focus();
    taHidden.select();
    document.execCommand('copy');
    taHidden.remove();
  } catch (_) {}
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const histOv = $('hist-overlay');
    if (histOv && histOv.style.display !== 'none') {
      closeHistoryModal();
      return;
    }
  }

  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); insert(); return; }

  // Human cannot change anything in AI mode (read-only)
  if (currentTopMode === 'ai') return;

  // Ctrl+C / Cmd+C: Copy text of selected words in the diagram
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
    const active = document.activeElement;
    const inInput = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'checkbox'));
    const hasInputSel = inInput && active.selectionStart !== active.selectionEnd;
    const domSel = window.getSelection()?.toString();

    if ((!inInput || !hasInputSel) && (!domSel || !domSel.trim().length) && sel.length > 0) {
      e.preventDefault();
      const txt = getSelectedText();
      if (txt) {
        copyTextToClipboard(txt);
        msg(L(`Скопировано: «${txt}»`, `Copied: "${txt}"`));
      }
      return;
    }
  }

  if (e.target.matches('textarea,input:not([type=checkbox]),select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (sel.length > 0) {
    const isPopoverVisible = showWordPopover && $('word-popover')?.style.display !== 'none';
    if (isPopoverVisible) {
      if (popoverStep === 'parts') {
        const match = POP_PARTS_ITEMS.find(it => it.kbd && it.kbd === e.key);
        if (match) {
          e.preventDefault();
          setA('m', match.id);
          popoverStep = 'pos';
          updateWordPopover();
          updateSidebarPalette();
          updateProgressBar();
          return;
        }
      } else if (popoverStep === 'pos') {
        const match = POP_POS_ITEMS.find(it => it.kbd && it.kbd === e.key);
        if (match) {
          e.preventDefault();
          setP(match.id);
          if (PO[match.id]?.[2]?.length > 0) {
            popoverStep = 'sub';
          }
          updateWordPopover();
          updateSidebarPalette();
          updateProgressBar();
          return;
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          popoverStep = 'parts';
          updateWordPopover();
          return;
        }
      } else if (popoverStep === 'sub') {
        if (e.key === 'Enter') {
          e.preventDefault();
          $('word-popover').style.display = 'none';
          return;
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          popoverStep = 'pos';
          updateWordPopover();
          return;
        }
      }
    }

    const pal = SIDEBAR_PALETTES[activeLayer] || SIDEBAR_PALETTES.parts;
    const match = pal.items.find(it => it.kbd === e.key);
    if (match) {
      e.preventDefault();
      pal.apply(match);
      updateWordPopover();
      updateSidebarPalette();
      updateProgressBar();
      return;
    }
  }
  if (KEY[e.key]) { setA('m', KEY[e.key]); if (tab === 'pos' && sel.length > 1) tab = 'm'; ui(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
  else if (e.key === 'Escape') { sel = []; selChanged(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey); }
});

document.addEventListener('copy', e => {
  const active = document.activeElement;
  const inInput = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'checkbox'));
  const hasInputSel = inInput && active.selectionStart !== active.selectionEnd;
  const domSel = window.getSelection()?.toString();

  if ((!inInput || !hasInputSel) && (!domSel || !domSel.trim().length) && sel.length > 0) {
    const txt = getSelectedText();
    if (txt) {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', txt);
      }
      copyTextToClipboard(txt);
      msg(L(`Скопировано: «${txt}»`, `Copied: "${txt}"`));
    }
  }
});

window.addEventListener('resize', () => {
  if (currentTopMode === 'ai') {
    renderAiCanvas();
  } else {
    render();
  }
});

if (typeof ResizeObserver !== 'undefined') {
  let roTimer = null;
  const ro = new ResizeObserver(() => {
    if (roTimer) cancelAnimationFrame(roTimer);
    roTimer = requestAnimationFrame(() => {
      if (currentTopMode === 'ai') {
        renderAiCanvas();
      } else {
        render();
      }
    });
  });
  if (wrap) ro.observe(wrap);
  const wrapAi = $('wrap-ai');
  if (wrapAi) ro.observe(wrapAi);
}

/* ---------- export canvas ---------- */
function exportCanvas(sc) {
  const S = 3, c = document.createElement('canvas'), ctx = c.getContext('2d');
  const availableW = lastRenderAvailableW || Math.max(300, (wrap && wrap.clientWidth) ? wrap.clientWidth : 800);
  const h = layout(ctx, availableW, true);
  const w = Math.ceil(Math.max(...toks.map(k => k.x + k.w), 60) + PX);
  c.width = w * S;
  c.height = h * S;
  ctx.scale(S, S);
  paint(ctx, w, h, true);
  c.lw = w;
  c.lh = h;
  render();
  return c;
}

/* ---------- copy image ---------- */
function showImg(url) {
  const o = document.createElement('div');
  o.className = 'ov';
  o.innerHTML = `<div class="bx"><div class="row"><span>${L('Автокопирование недоступно в этом браузере. Сохраните файл или скопируйте через меню:', 'Automatic clipboard copy failed. Please save the file or copy manually:')}</span><button data-x="1" title="${esc(tip('u:cls'))}">&times;</button></div><img src="${url}" alt=""><div class="row"><a download="foma-parse.png" href="${url}"><button title="${esc(tip('u:dl'))}">PNG</button></a></div></div>`;
  const close = () => { o.remove(); document.removeEventListener('keydown', k, true); };
  const k = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  o.onclick = e => { if (e.target === o || e.target.closest('[data-x]')) close(); };
  document.addEventListener('keydown', k, true);
  document.body.appendChild(o);
}

function copyDataUrlSync(dataUrl) {
  try {
    const d = document.createElement('div');
    d.contentEditable = 'true';
    d.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const im = document.createElement('img');
    im.src = dataUrl;
    d.appendChild(im);
    (document.body || document.documentElement).appendChild(d);
    const r = document.createRange();
    r.selectNode(im);
    const sl = window.getSelection();
    sl.removeAllRanges();
    sl.addRange(r);
    d.focus();
    const ok = document.execCommand('copy');
    sl.removeAllRanges();
    d.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

function copyCanvas(canvas, onSuccess = null, onError = null) {
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');

  // Notify parent window (host page) to also copy via bridge
  try {
    window.parent?.postMessage({ action: 'foma_parser_copy_image', dataUrl }, '*');
  } catch (_) {}

  // 1. Modern Clipboard API with Promise inside ClipboardItem (preserves transient user activation in Chrome)
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const blobPromise = new Promise((resolve, reject) => {
        try {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
        } catch (err) { reject(err); }
      });
      const item = new ClipboardItem({ 'image/png': blobPromise });
      navigator.clipboard.write([item]).then(() => {
        if (onSuccess) onSuccess();
      }).catch(() => {
        if (copyDataUrlSync(dataUrl)) {
          if (onSuccess) onSuccess();
        } else {
          if (onError) onError(dataUrl);
        }
      });
      return;
    } catch (_) {}
  }

  // 2. Fallback: synchronous execCommand with data URL
  if (copyDataUrlSync(dataUrl)) {
    if (onSuccess) onSuccess();
  } else {
    if (onError) onError(dataUrl);
  }
}

function copyImage(onSuccess = null) {
  if (currentTopMode === 'ai') {
    if (!currentAiIdeal) return msg(L('Разбор от ИИ ещё не готов.', 'AI parse not ready yet.'));
    const sc = +$('sc').value;
    const c = exportAiCanvas(sc);
    if (!c) return msg(L('Нет изображения для копирования.', 'No image to copy.'));
    const ok = () => {
      const modelName = lastAiFilledModel || 'AI';
      msg(L(`Картинка от ИИ (${modelName}) скопирована в буфер. Вставьте в Google Docs через Ctrl+V.`, `AI image (${modelName}) copied to clipboard. Paste into Google Docs with Ctrl+V.`));
      if (onSuccess) onSuccess();
    };
    const fb = (url) => showImg(url);
    copyCanvas(c, ok, fb);
    return;
  }
  if (!toks.some(k => k.word)) return msg(L('Нет текста для копирования.', 'No text to copy.'));
  const sc = +$('sc').value, c = exportCanvas(sc);

  const ok = () => {
    msg(L('Картинка скопирована в буфер. Вставьте в Google Docs через Ctrl+V.', 'Image copied to clipboard. Paste into Google Docs with Ctrl+V.'));
    if (onSuccess) onSuccess();
  };
  const fb = (url) => showImg(url);

  copyCanvas(c, ok, fb);
}

if ($('cp')) $('cp').onclick = () => copyImage();

/* ---------- History Storage & Management ---------- */
const HIST_KEY = 'foma_parser_history';
let historyCache = [];
let histFilterInsertedOnly = false;

function normalizeHistoryText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    // Convert all typographic / smart quotes to ascii "
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    // Convert all typographic apostrophes and single quotes to ascii '
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u02BD`']/g, "'")
    // Convert all dashes and hyphens to simple hyphen
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u00AD]/g, '-')
    // Replace all non-breaking spaces and whitespace sequences with a single space
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B\uFEFF]+/g, ' ')
    // Normalize spacing around punctuation
    .replace(/\s*([,.:;?!'"])\s*/g, '$1')
    .trim();
}

function deduplicateHistory(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();

  for (const item of list) {
    if (!item || !item.text) continue;
    const key = normalizeHistoryText(item.text);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key);
      if (item.wasInserted) existing.wasInserted = true;
      if (!existing.aiIdeal && item.aiIdeal) {
        existing.aiIdeal = item.aiIdeal;
        existing.aiModel = item.aiModel;
        existing.aiLatency = item.aiLatency;
        existing.aiVerdict = item.aiVerdict;
      }
      const exMarks = (existing.an || []).length + (existing.toks || []).filter(t => t.p).length;
      const itMarks = (item.an || []).length + (item.toks || []).filter(t => t.p).length;
      if (itMarks > exMarks) {
        existing.toks = item.toks;
        existing.an = item.an;
        existing.st = item.st;
        existing.fs = item.fs;
        existing.scale = item.scale;
      }
      if (item.settings) {
        existing.settings = { ...(existing.settings || {}), ...item.settings };
      }
      if (item.date && (!existing.date || item.date > existing.date)) {
        existing.date = item.date;
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 200);
}

function loadHistory(cb) {
  const sanitizeHist = (list) => {
    return deduplicateHistory(list || []).map(item => {
      if (!item) return item;
      if (item.toks) item.toks = ensureToksSpacing(item.toks, null);
      if (item.aiIdeal?.toks) item.aiIdeal.toks = ensureToksSpacing(item.aiIdeal.toks, item.toks);
      return item;
    });
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([HIST_KEY], res => {
      historyCache = sanitizeHist(res[HIST_KEY] || []);
      chrome.storage.local.set({ [HIST_KEY]: historyCache });
      updateHistoryBadge();
      if (cb) cb(historyCache);
    });
  } else {
    try {
      historyCache = sanitizeHist(JSON.parse(localStorage.getItem(HIST_KEY) || '[]'));
      localStorage.setItem(HIST_KEY, JSON.stringify(historyCache));
    } catch (_) { historyCache = []; }
    updateHistoryBadge();
    if (cb) cb(historyCache);
  }
}

function updateHistoryBadge() {
  const cnt = document.getElementById('hist-cnt');
  if (cnt) cnt.textContent = historyCache.length;
  const headerCount = document.getElementById('hist-header-count');
  if (headerCount) headerCount.textContent = historyCache.length;
  const st = document.getElementById('hist-status');
  if (st) st.textContent = `${L('Всего предложений: ', 'Total sentences: ')}${historyCache.length}`;
}

function saveCurrentToHistory(wasInserted = false) {
  const text = ta.value.trim();
  if (!text) return;

  const normKey = normalizeHistoryText(text);
  if (!normKey) return;

  const existingIdx = historyCache.findIndex(x => x && normalizeHistoryText(x.text) === normKey);
  const existing = existingIdx >= 0 ? historyCache[existingIdx] : null;

  const item = {
    id: existing ? existing.id : ('foma_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    text: text,
    date: Date.now(),
    wasInserted: wasInserted ? true : !!(existing && existing.wasInserted),
    scale: $('sc')?.value || (existing?.scale) || '70',
    isFullHeight: isFullHeight,
    toks: toks.map(k => ({ t: k.t, word: k.word, p: k.p, s: k.s, sp: !!k.sp, br: !!k.br })),
    an: an.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })),
    st: [...ST],
    fs: [...FS],
    aiIdeal: currentAiIdeal ? {
      toks: ensureToksSpacing(currentAiIdeal.toks, toks).map(k => ({ t: k.t, word: k.word, p: k.p, s: k.s, sp: !!k.sp, br: !!k.br })),
      detailedAn: (currentAiIdeal.detailedAn || currentAiIdeal.an).map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })),
      macroAn: (currentAiIdeal.macroAn || currentAiIdeal.an).map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })),
      an: currentAiIdeal.an.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f })),
      st: [...currentAiIdeal.st]
    } : (existing?.aiIdeal || null),
    aiProvider: AI.provider || existing?.aiProvider || 'positionapi',
    aiModel: lastAiFilledModel || existing?.aiModel || null,
    aiLatency: lastAiFilledLatency || existing?.aiLatency || null,
    aiVerdict: lastAiVerdict || existing?.aiVerdict || null,
    settings: {
      scale: $('sc')?.value || existing?.scale || '70',
      isFullHeight: isFullHeight,
      aiLayers: JSON.parse(JSON.stringify(aiLayers)),
      aiGranularity: aiGranularity,
      dockLayout: JSON.parse(JSON.stringify(dockLayout)),
      innerDockLayout: JSON.parse(JSON.stringify(innerDockLayout)),
      aiProvider: AI.provider,
      aiModel: lastAiFilledModel || AI.activeModel[AI.provider]
    }
  };

  if (existingIdx >= 0) {
    historyCache.splice(existingIdx, 1);
  }
  historyCache.unshift(item);

  historyCache = deduplicateHistory(historyCache);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [HIST_KEY]: historyCache }, updateHistoryBadge);
  } else {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(historyCache)); } catch (_) {}
    updateHistoryBadge();
  }
}

function deleteHistoryItem(id) {
  historyCache = historyCache.filter(x => x.id !== id);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [HIST_KEY]: historyCache });
  } else {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(historyCache)); } catch (_) {}
  }
  updateHistoryBadge();
  renderHistoryUI();
}

function clearAllHistory() {
  if (!confirm(L('Вы уверены, что хотите полностью очистить историю разборов?', 'Are you sure you want to clear the entire parse history?'))) return;
  historyCache = [];
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [HIST_KEY]: [] });
  } else {
    try { localStorage.removeItem(HIST_KEY); } catch (_) {}
  }
  updateHistoryBadge();
  renderHistoryUI();
}

function applySentenceSettings(settings) {
  if (!settings) return;
  if (settings.scale && $('sc')) $('sc').value = settings.scale;
  if (typeof settings.isFullHeight === 'boolean') setFullHeight(settings.isFullHeight);
  if (settings.aiLayers && typeof settings.aiLayers === 'object') {
    aiLayers = { ...aiLayers, ...settings.aiLayers };
    syncLayerCheckboxes();
  }
  if (settings.aiGranularity) {
    aiGranularity = settings.aiGranularity;
    updateAiGranularityButtons();
  }
  if (settings.dockLayout) {
    dockLayout = cleanDockLayout(settings.dockLayout);
  }
  if (settings.innerDockLayout && typeof settings.innerDockLayout === 'object') {
    innerDockLayout = { ...innerDockLayout, ...settings.innerDockLayout };
  }
  if (settings.aiProvider && PROVIDERS[settings.aiProvider]) {
    AI.provider = settings.aiProvider;
  }
  if (settings.aiModel) {
    AI.activeModel[AI.provider] = settings.aiModel;
  }
  syncAiSelectors();
}

function restoreHistoryItem(item) {
  ta.value = item.text;
  parse();
  if (item.toks && item.toks.length) {
    toks.forEach((k, i) => {
      const saved = item.toks[i];
      if (saved && saved.t === k.t) {
        k.p = saved.p || null;
        k.s = saved.s ? [...saved.s] : null;
      }
    });
  }
  const seenHistAn = new Set();
  an = [];
  for (const a of (item.an || [])) {
    const key = `${a.k}:${a.v}:${[...(a.ix || [])].sort((x, y) => x - y).join(',')}`;
    if (!seenHistAn.has(key)) {
      seenHistAn.add(key);
      an.push({ k: a.k, v: a.v, ix: [...a.ix], f: a.f });
    }
  }
  ST = item.st ? [...item.st] : ['', '', '', ''];
  FS = item.fs ? [...item.fs] : ['', '', '', ''];
  if (item.scale && $('sc')) $('sc').value = item.scale;

  if (item.aiIdeal) {
    const restoredToks = ensureToksSpacing(item.aiIdeal.toks, toks);
    const { detailedAn, macroAn, activeAn } = ensureAiGranularityAn(item.aiIdeal, restoredToks);

    currentAiIdeal = {
      toks: restoredToks,
      detailedAn,
      macroAn,
      an: activeAn,
      st: [...(item.aiIdeal.st || [])]
    };
    lastAiFilledText = item.text;
    lastAiFilledModel = item.aiModel || '';
    lastAiFilledLatency = item.aiLatency || null;
    lastAiVerdict = item.aiVerdict || null;
    updateAiHeaderInfo();
    if (lastAiVerdict) renderAiVerdictCard(lastAiVerdict);
  } else {
    currentAiIdeal = null;
    lastAiFilledText = '';
    lastAiFilledModel = '';
    lastAiFilledLatency = null;
    lastAiVerdict = null;
    updateAiHeaderInfo();
  }

  if (item.settings) {
    applySentenceSettings(item.settings);
  }

  const f = toks.findIndex(k => k.word);
  sel = f >= 0 ? [f] : [];
  anc = last = f;

  if (currentTopMode === 'ai') {
    onEnterAiMode();
  } else {
    render();
    ui();
  }
  closeHistoryModal();
  msg(L('Разбор загружен из истории.', 'Parse loaded from history.'));
}

function exportHistory() {
  const blob = new Blob([JSON.stringify(historyCache, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `foma_sentence_history_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatHistDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `${L('Сегодня', 'Today')}, ${time}`;
  }
  const dateStr = d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${dateStr} ${time}`;
}

function formatMarksCount(count) {
  if (!count) return '';
  const isRu = TL === 'ru';
  if (!isRu) return `${count} ${count === 1 ? 'mark' : 'marks'}`;
  const lastTwo = count % 100;
  const last = count % 10;
  let word = 'меток';
  if (lastTwo < 11 || lastTwo > 14) {
    if (last === 1) word = 'метка';
    else if (last >= 2 && last <= 4) word = 'метки';
  }
  return `${count} ${word}`;
}

function renderHistoryUI() {
  const listEl = $('hist-list');
  if (!listEl) return;

  historyCache = deduplicateHistory(historyCache);
  updateHistoryBadge();

  const searchInput = $('hist-search');
  const q = (searchInput?.value || '').toLowerCase().trim();
  const clearBtn = $('hist-search-clear');
  if (clearBtn) {
    clearBtn.style.display = q ? 'flex' : 'none';
  }

  let filtered = historyCache;
  if (histFilterInsertedOnly) {
    filtered = filtered.filter(x => x.wasInserted);
  }
  if (q) {
    filtered = filtered.filter(x => x.text && x.text.toLowerCase().includes(q));
  }

  // Update tabs active state and counts
  const tabAll = $('hist-filter-all');
  if (tabAll) {
    tabAll.classList.toggle('active', !histFilterInsertedOnly);
    tabAll.setAttribute('aria-selected', !histFilterInsertedOnly ? 'true' : 'false');
    tabAll.textContent = `${L('Все', 'All')} (${historyCache.length})`;
  }

  const insertedCount = historyCache.filter(x => x.wasInserted).length;
  const tabIns = $('hist-filter-inserted');
  if (tabIns) {
    tabIns.classList.toggle('active', histFilterInsertedOnly);
    tabIns.setAttribute('aria-selected', histFilterInsertedOnly ? 'true' : 'false');
    tabIns.textContent = `${L('Вставленные', 'Inserted')} (${insertedCount})`;
  }

  // Update footer status
  const st = $('hist-status');
  if (st) {
    if (filtered.length !== historyCache.length) {
      st.textContent = `${L('Найдено:', 'Found:')} ${filtered.length} ${L('из', 'of')} ${historyCache.length}`;
    } else {
      st.textContent = `${L('Всего:', 'Total:')} ${historyCache.length}`;
    }
  }

  if (!filtered.length) {
    const isFiltered = !!q || histFilterInsertedOnly;
    listEl.innerHTML = `
      <div class="hist-empty">
        <div class="hist-empty-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <div class="hist-empty-title">${isFiltered ? L('Ничего не найдено', 'No matches found') : L('История разборов пуста', 'History is empty')}</div>
        <div class="hist-empty-desc">${isFiltered ? L('Попробуйте изменить поисковый запрос или переключиться на вкладку «Все».', 'Try changing your search query or switch back to "All".') : L('Разобранные и скопированные предложения будут автоматически сохраняться здесь для быстрого повторного использования.', 'Sentences parsed and copied will automatically be saved here for quick reuse.')}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(item => {
    const dateFormatted = formatHistDate(item.date);
    const markedCount = (item.an || []).length;
    const posCount = (item.toks || []).filter(t => t.p).length;
    const stStr = (item.st || []).filter(Boolean).join(' · ');

    const badges = [];
    if (item.wasInserted) {
      badges.push(`<span class="hist-badge hist-badge-inserted" title="${L('Вставлено в Google Docs', 'Inserted into Google Docs')}"><span class="hist-badge-dot"></span>${L('Вставлено', 'Inserted')}</span>`);
    }
    if (item.aiIdeal || item.aiModel) {
      const modelName = item.aiModel || (item.aiIdeal ? 'AI' : '');
      const cleanModel = modelName.replace(/^(openai\/|anthropic\/|google\/)/, '');
      badges.push(`<span class="hist-badge hist-badge-ai" title="${L('Разбор с помощью ИИ', 'Parsed with AI')}">AI · ${esc(cleanModel || 'auto')}</span>`);
    }
    if (markedCount > 0) {
      const markLabel = formatMarksCount(markedCount);
      const posLabel = posCount > 0 ? ` · ${posCount} POS` : '';
      badges.push(`<span class="hist-badge hist-badge-meta">${markLabel}${posLabel}</span>`);
    }
    if (stStr) {
      badges.push(`<span class="hist-badge hist-badge-type" title="${L('Тип предложения', 'Sentence type')}">${esc(stStr)}</span>`);
    }

    const isLongText = (item.text || '').length > 170;

    return `
      <div class="hist-item ${item.wasInserted ? 'is-inserted' : ''}" data-id="${item.id}" tabindex="0" role="button" aria-label="${L('Загрузить предложение в редактор', 'Load sentence into editor')}">
        <div class="hist-item-body">
          <div class="hist-text ${isLongText ? 'is-clamped' : ''}" title="${esc(item.text)}">${esc(item.text)}</div>
          <div class="hist-meta-row">
            <div class="hist-badges">${badges.join('')}</div>
            <span class="hist-date">${dateFormatted}</span>
          </div>
        </div>
        <div class="hist-actions">
          <button type="button" class="hist-btn-action" data-act="load" title="${L('Загрузить в редактор', 'Load into editor')}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>${L('Загрузить', 'Load')}</span>
          </button>
          <button type="button" class="hist-btn-icon" data-act="copy" title="${L('Скопировать текст', 'Copy text')}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button type="button" class="hist-btn-icon hist-btn-del" data-act="del" title="${L('Удалить из истории', 'Delete record')}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openHistoryModal() {
  loadHistory(() => {
    renderHistoryUI();
    const ov = $('hist-overlay');
    if (ov) ov.style.display = 'flex';
  });
}

function closeHistoryModal() {
  const ov = $('hist-overlay');
  if (ov) ov.style.display = 'none';
}

// ── History Event Handlers ──
$('btn-history')?.addEventListener('click', openHistoryModal);
$('hist-close')?.addEventListener('click', closeHistoryModal);
$('hist-overlay')?.addEventListener('click', e => {
  if (e.target.id === 'hist-overlay') closeHistoryModal();
});
$('hist-search')?.addEventListener('input', renderHistoryUI);
$('hist-search-clear')?.addEventListener('click', () => {
  const searchInput = $('hist-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
    renderHistoryUI();
  }
});

$('hist-filter-all')?.addEventListener('click', () => {
  histFilterInsertedOnly = false;
  renderHistoryUI();
});

$('hist-filter-inserted')?.addEventListener('click', () => {
  histFilterInsertedOnly = !histFilterInsertedOnly;
  renderHistoryUI();
});

$('hist-clear')?.addEventListener('click', clearAllHistory);
$('hist-export')?.addEventListener('click', exportHistory);

$('hist-list')?.addEventListener('click', e => {
  const itemEl = e.target.closest('.hist-item');
  if (!itemEl) return;
  const id = itemEl.dataset.id;
  const item = historyCache.find(x => x.id === id);
  if (!item) return;

  const btn = e.target.closest('button');
  const act = btn?.dataset?.act;

  if (act === 'del') {
    deleteHistoryItem(id);
    return;
  }
  if (act === 'copy') {
    navigator.clipboard?.writeText(item.text);
    msg(L('Текст предложения скопирован!', 'Sentence text copied!'));
    return;
  }
  // Clicked 'load' or clicked anywhere else on the item card:
  restoreHistoryItem(item);
});

$('hist-list')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const itemEl = e.target.closest('.hist-item');
    if (itemEl && !e.target.closest('button')) {
      e.preventDefault();
      const id = itemEl.dataset.id;
      const item = historyCache.find(x => x.id === id);
      if (item) restoreHistoryItem(item);
    }
  }
});

/* ---------- insert (copy + notify overlay) ---------- */
function insert() {
  if (currentTopMode === 'ai') {
    if (!currentAiIdeal) return msg(L('Разбор от ИИ ещё не готов.', 'AI parse not ready yet.'));
    saveCurrentToHistory(true);
    copyImage(() => {
      const modelName = lastAiFilledModel || 'AI';
      window.parent?.postMessage({
        action: 'foma_parser_toast',
        text: L(`Разбор от ИИ (${modelName}) скопирован! Нажмите Ctrl+V для вставки в Google Docs`, `AI parse (${modelName}) copied! Press Ctrl+V to paste into Google Docs`),
        closeAfter: true
      }, '*');
    });
    return;
  }
  if (!toks.some(k => k.word)) return msg(L('Нет текста для вставки.', 'No text to insert.'));

  // Save to persistent history with wasInserted = true
  saveCurrentToHistory(true);

  copyImage(() => {
    window.parent?.postMessage({
      action: 'foma_parser_toast',
      text: L('Разбор скопирован! Нажмите Ctrl+V для вставки в Google Docs', 'Parse copied! Press Ctrl+V to paste into Google Docs'),
      closeAfter: true
    }, '*');
  });
}

$('ins').onclick = insert;

/* ---------- Global pane click & AI schema delegation ---------- */
document.addEventListener('click', e => {
  if (e.target.id === 'btn-apply-ai') {
    if (!currentAiIdeal) return;
    toks.forEach((k, i) => {
      const src = currentAiIdeal.toks[i];
      if (src) { k.p = src.p; k.s = src.s ? [...src.s] : []; }
    });
    an = currentAiIdeal.an.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f }));
    ST = [...currentAiIdeal.st];
    const firstPred = an.find(a => a.k === 'f');
    FS = firstPred && firstPred.f ? [...firstPred.f] : ['', '', '', ''];
    saveCurrentToHistory(false);
    render();
    ui();
    msg(L('Эталонный разбор от ИИ применён к основному холсту!', 'AI parse applied to main canvas!'));
  } else if (e.target.id === 'btn-copy-ai-img') {
    const aiCv = $('ai-cv');
    if (!aiCv) return;
    copyCanvas(aiCv, () => {
      msg(L('Картинка разбора ИИ скопирована в буфер!', 'AI parse image copied to clipboard!'));
    }, (url) => {
      showImg(url);
    });
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'aip') {
    AI.provider = e.target.value;
    chrome.storage?.local?.set({ aiprovider: AI.provider });
    ui();
  }
});

/* ---------- translate (display only) ---------- */
async function webTr(t, to) {
  const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  try {
    const d = await j('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + to + '&dt=t&q=' + encodeURIComponent(t));
    const r = d[0].map(x => x[0]).join('');
    if (r) return { r, src: 'Google' };
  } catch (_) {}
  const d = await j('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(t) + '&langpair=' + (to === 'en' ? 'ru|en' : 'en|ru'));
  if (!d.responseData || !d.responseData.translatedText) throw new Error('empty');
  return { r: d.responseData.translatedText, src: 'MyMemory' };
}

async function translate() {
  const t = ta.value.trim(), o = $('tr');
  if (!t) return msg(L('Нет текста для перевода.', 'No text to translate.'));
  const to = /[Ѐ-ӿ]/.test(t) ? 'en' : 'ru';
  o.hidden = false;
  o.className = 'tr';
  o.textContent = L('Перевожу…', 'Translating…');
  $('trb').disabled = true;

  try {
    const x = await webTr(t, to);
    o.innerHTML = `<span class="tg">${x.src} · ${to.toUpperCase()}</span>`;
    o.appendChild(document.createTextNode(x.r));
  } catch (e) {
    o.className = 'tr err';
    o.textContent = L('Ошибка перевода: ', 'Translation error: ') + (e && e.message || e);
  }
  $('trb').disabled = false;
}

$('trb').onclick = translate;

/* ---------- Suppress FOMA Translator in Parser ---------- */
let suppressTranslatorObserver = null;
const suppressTranslatorInParser = () => {
  const trg = document.getElementById('foma-translator-trigger');
  if (trg) {
    try {
      trg.style.setProperty('display', 'none', 'important');
      trg.remove();
    } catch (_) {}
    if (suppressTranslatorObserver) {
      suppressTranslatorObserver.disconnect();
      suppressTranslatorObserver = null;
    }
  }
};
try {
  suppressTranslatorObserver = new MutationObserver(suppressTranslatorInParser);
  suppressTranslatorObserver.observe(document.body || document.documentElement, { childList: true });
  setTimeout(() => {
    if (suppressTranslatorObserver) {
      suppressTranslatorObserver.disconnect();
      suppressTranslatorObserver = null;
    }
  }, 4000);
} catch (_) {}
suppressTranslatorInParser();

/* ---------- init from storage / URL parameters ---------- */
async function init() {
  setupTopModeEvents();
  setupJsonImportModal();
  setupAuto100ConfigModal();
  setupSettingsModal();

  const isPublicWeb = document.documentElement.getAttribute('data-env') === 'public';
  if (isPublicWeb) {
    currentTopMode = 'manual';
    const modeTabs = $('mode-tabs');
    if (modeTabs) modeTabs.style.display = 'none';
    const aiControls = $('ai-top-controls');
    if (aiControls) aiControls.style.display = 'none';
    const aiActions = $('ai-top-actions');
    if (aiActions) aiActions.style.display = 'none';
    const viewAi = $('view-ai');
    if (viewAi) viewAi.style.display = 'none';
  }

  const params = new URLSearchParams(window.location.search);
  const initialText = params.get('text') || '';

  // Load user settings from Chrome storage
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([
      'tl', 'view', 'scale', 'replace', 'foma_theme',
      'aiprovider', 'aikeys', 'aicustomurl', 'aiactivemodels', 'aimodels', 'ailang',
      'aikey', 'aimodel', 'foma_ai_granularity',
      'foma_dock_layout', 'foma_inner_dock_layout', 'foma_ai_layers', 'foma_is_full_height', 'foma_canvas_height',
      'foma_edit_panel_open',
      'foma_auto_100_rules',
      'foma_show_word_popover',
      'foma_word_popover_layout',
      'foma_parts_format',
      'foma_show_progress_bar',
      HIST_KEY
    ], res => {
      if (res.foma_theme) {
        setTheme(res.foma_theme, false);
      } else {
        setTheme('light', false);
      }
      if (res.foma_show_word_popover !== undefined) {
        showWordPopover = Boolean(res.foma_show_word_popover);
      }
      if (res.foma_show_progress_bar !== undefined) {
        showProgressBar = Boolean(res.foma_show_progress_bar);
        const bar = $('top-progress-bar');
        if (bar) bar.style.display = showProgressBar ? '' : 'none';
      }
      if (res.foma_word_popover_layout && (res.foma_word_popover_layout === 'row' || res.foma_word_popover_layout === 'column')) {
        wordPopoverLayout = res.foma_word_popover_layout;
      }
      if (res.foma_parts_format && ['combo', 'full', 'short', 'symbols_only'].includes(res.foma_parts_format)) {
        partsFormat = res.foma_parts_format;
      }
      if (res.foma_auto_100_rules) {
        auto100Rules = { ...DEFAULT_AUTO_100_RULES, ...res.foma_auto_100_rules };
      }
      if (res.tl) TL = res.tl;
      if (res.view) VIEW = res.view === 'scroll' ? 'grid' : res.view;
      if (res.scale && $('sc')) $('sc').value = res.scale;
      if (res.replace !== undefined && $('rp')) $('rp').checked = res.replace;
      if (res.foma_ai_granularity) {
        aiGranularity = res.foma_ai_granularity;
        updateAiGranularityButtons();
      }
      if (res.foma_dock_layout) {
        dockLayout = cleanDockLayout(res.foma_dock_layout);
      }
      if (res.foma_inner_dock_layout) {
        innerDockLayout = { ...innerDockLayout, ...res.foma_inner_dock_layout };
      }
      if (res.foma_ai_layers) {
        aiLayers = { ...aiLayers, ...res.foma_ai_layers };
        syncLayerCheckboxes();
      }
      if (typeof res.foma_is_full_height === 'boolean') {
        setFullHeight(res.foma_is_full_height);
      }
      if (res.foma_canvas_height && typeof res.foma_canvas_height === 'number') {
        const h = Math.max(96, Math.min(window.innerHeight - 100, res.foma_canvas_height));
        if ($('wrap')) $('wrap').style.height = `${h}px`;
        if ($('wrap-ai')) $('wrap-ai').style.height = `${h}px`;
        if ($('canvas-with-sidebar')) $('canvas-with-sidebar').style.height = `${h}px`;
      }
      if (res.foma_edit_panel_open !== undefined) {
        toggleEditPanel(Boolean(res.foma_edit_panel_open));
      } else {
        toggleEditPanel(false);
      }

      if (res.aiprovider) AI.provider = res.aiprovider;
      if (res.aikeys) AI.keys = { ...AI.keys, ...res.aikeys };
      if (res.aicustomurl) AI.customUrl = res.aicustomurl;
      if (res.aiactivemodels) AI.activeModel = { ...AI.activeModel, ...res.aiactivemodels };
      if (res.aimodels) AI.models = { ...AI.models, ...res.aimodels };
      if (res.ailang) AI.lang = res.ailang;

      if (res.aikey && !AI.keys.groq && !AI.keys.positionapi) {
        if (res.aikey.startsWith('gsk_')) {
          AI.keys.groq = res.aikey;
          if (!res.aiprovider) AI.provider = 'groq';
        } else {
          AI.keys.positionapi = res.aikey;
          if (!res.aiprovider) AI.provider = 'positionapi';
        }
      }
      if (res.aimodel) {
        AI.activeModel[AI.provider] = res.aimodel;
      }

      // Automatically migrate models to current working list
      if (!AI.activeModel.positionapi || !PROVIDERS.positionapi.models.includes(AI.activeModel.positionapi)) {
        AI.activeModel.positionapi = PROVIDERS.positionapi.defaultModel;
        chrome.storage?.local?.set({ aiactivemodels: AI.activeModel });
      }
      if (!AI.activeModel.groq || !PROVIDERS.groq.models.includes(AI.activeModel.groq)) {
        AI.activeModel.groq = PROVIDERS.groq.defaultModel;
        chrome.storage?.local?.set({ aiactivemodels: AI.activeModel });
      }
      if (!AI.models.groq || !AI.models.groq.includes('llama-3.1-8b-instant')) {
        AI.models.groq = [...PROVIDERS.groq.models];
        chrome.storage?.local?.set({ aimodels: AI.models });
      }

      if (res[HIST_KEY]) {
        historyCache = deduplicateHistory(res[HIST_KEY] || []).map(item => {
          if (!item) return item;
          if (item.toks) item.toks = ensureToksSpacing(item.toks, null);
          if (item.aiIdeal?.toks) item.aiIdeal.toks = ensureToksSpacing(item.aiIdeal.toks, item.toks);
          return item;
        });
        chrome.storage?.local?.set({ [HIST_KEY]: historyCache });
        updateHistoryBadge();
      }

      setupSentence(initialText);
      ui();
      syncAiSelectors();
    });
  } else {
    try {
      const savedH = parseInt(localStorage.getItem('foma_canvas_height'), 10);
      if (savedH && !isNaN(savedH)) {
        if ($('wrap')) $('wrap').style.height = `${savedH}px`;
        if ($('wrap-ai')) $('wrap-ai').style.height = `${savedH}px`;
        if ($('canvas-with-sidebar')) $('canvas-with-sidebar').style.height = `${savedH}px`;
      }
      const savedEditOpen = localStorage.getItem('foma_edit_panel_open') === '1';
      toggleEditPanel(savedEditOpen);
      const savedTheme = localStorage.getItem('foma_theme');
      if (savedTheme) {
        try { setTheme(JSON.parse(savedTheme), false); } catch (_) { setTheme(savedTheme, false); }
      } else {
        setTheme('light', false);
      }
      const savedPopover = localStorage.getItem('foma_show_word_popover');
      if (savedPopover !== null) showWordPopover = (savedPopover !== '0' && savedPopover !== 'false');
      const savedProgress = localStorage.getItem('foma_show_progress_bar');
      if (savedProgress !== null) showProgressBar = (savedProgress !== '0' && savedProgress !== 'false');
      const bar = $('top-progress-bar');
      if (bar) bar.style.display = showProgressBar ? '' : 'none';
      const savedLayout = localStorage.getItem('foma_word_popover_layout');
      if (savedLayout === 'column' || savedLayout === 'row') wordPopoverLayout = savedLayout;
      const savedFormat = localStorage.getItem('foma_parts_format');
      if (['combo', 'full', 'short', 'symbols_only'].includes(savedFormat)) partsFormat = savedFormat;
    } catch (_) {}
    loadHistory();
    setupSentence(initialText);
    ui();
    syncAiSelectors();
  }
}

function setupSentence(text) {
  const targetText = text || 'The thing he fears most of all.';
  ta.value = targetText;
  parse();

  // If this sentence was already parsed in history, restore its parameters
  const normKey = normalizeHistoryText(targetText);
  const saved = historyCache.find(x => x && x.text && normalizeHistoryText(x.text) === normKey);
  if (saved) {
    if (saved.toks && saved.toks.length) {
      toks.forEach((k, i) => {
        const st = saved.toks[i];
        if (st && st.t === k.t) {
          k.p = st.p || null;
          k.s = st.s ? [...st.s] : null;
        }
      });
    }
    if (saved.an) {
      an = saved.an.map(a => ({ k: a.k, v: a.v, ix: [...a.ix], f: a.f }));
      sanitizeSentenceParts();
    }
    if (saved.st) ST = [...saved.st];
    if (saved.fs) FS = [...saved.fs];
    if (saved.scale && $('sc')) $('sc').value = saved.scale;

    if (saved.settings) {
      applySentenceSettings(saved.settings);
    }

    if (saved.aiIdeal) {
      const restoredToks = ensureToksSpacing(saved.aiIdeal.toks, toks);
      const { detailedAn, macroAn, activeAn } = ensureAiGranularityAn(saved.aiIdeal, restoredToks);

      currentAiIdeal = {
        toks: restoredToks,
        detailedAn,
        macroAn,
        an: activeAn,
        st: [...(saved.aiIdeal.st || [])]
      };
      lastAiFilledText = targetText;
      lastAiFilledModel = saved.aiModel || '';
      lastAiFilledLatency = saved.aiLatency || null;
      lastAiVerdict = saved.aiVerdict || null;
      updateAiHeaderInfo();
      if (lastAiVerdict) renderAiVerdictCard(lastAiVerdict);
    } else {
      currentAiIdeal = null;
      lastAiFilledText = '';
      lastAiFilledModel = '';
      lastAiFilledLatency = null;
      lastAiVerdict = null;
      updateAiHeaderInfo();
    }
  } else {
    currentAiIdeal = null;
    lastAiFilledText = '';
    lastAiFilledModel = '';
    lastAiFilledLatency = null;
    lastAiVerdict = null;
    updateAiHeaderInfo();
  }

  const f = toks.findIndex(k => k.word);
  sel = f >= 0 ? [f] : [];
  anc = last = f;
  selChanged();
  saveCurrentToHistory(false);

  if (currentTopMode === 'ai') {
    onEnterAiMode();
  }

  msg(text ? L('Предложение загружено. Выберите слово или выделите группу слов.', 'Sentence loaded. Pick a word to set part of speech or drag across words for sentence parts.') : L('Введите или вставьте предложение для разбора.', 'Type or paste a sentence above to parse.'));
}

window.addEventListener('message', (e) => {
  if (e.data?.action === 'foma_parser_prepare_expand') {
    try {
      saveCurrentToHistory(false);
      window.parent?.postMessage({ action: 'foma_parser_text_sync', text: ta.value }, '*');
    } catch (_) {}
  }
});

window.addEventListener('DOMContentLoaded', init);
