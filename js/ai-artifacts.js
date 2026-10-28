// ai-artifacts.js - "Obvious AI tells": the chatbot talking to whoever prompted it.
//
// Only unambiguous leftovers are SCORED: the assistant's preamble or sign-off,
// the model talking about itself, commentary on its own output, and chat-template
// tokens. Each adds points on top of the botstyle score.
//
// Everything that a human drafting process can also produce (unfilled placeholders,
// text that stops mid-sentence, JSON field residue from an export, pasted chat logs,
// word-count notes) is reported as an unscored NOTE: worth a look, not evidence.
//
// NOT counted here: copy-pasted jailbreak / narrator templates ("{{char}} will never
// speak for {{user}}"). Humans paste those constantly; card-preprocess.js tallies
// them as boilerplate.

export const ARTIFACT_POINTS = { strong: 40, cap: 80 };   // scorer 0.7.0: was 25 / 50 on the old, narrower scale   // notes score nothing

import { stripExampleDialogue } from './human-tells.js';

// narr: run on narration only (quoted speech and example dialogue removed), so a
// character saying "As an AI, I feel nothing" or "Would you like me to…" doesn't count.
const R = (rx, id, label, strength, note, narr = true) => ({ rx, id, label, strength, note, narr });
const META_VERBS = '(?:adjust|modify|tweak|change|edit|revise|customi[sz]e|expand|rewrite|refine|shorten|lengthen|add more|make (?:any )?changes|generate|create (?:another|a new|more))';

const RULES = [
  // --- the assistant talking to whoever prompted it ---
  R(/(?:^|\n|[.!?)\]]\s+)(?:(?:sure|certainly|absolutely|of course)[!,.]?\s+(?:here(?:'s| is| are)\b|i(?:'d| would) be (?:happy|glad) to\b|i can (?:help|create|write)\b|i(?:'ll| will) (?:create|write|expand|generate|describe|provide)\b)|(?:okay|alright|great)[!,.]?\s+here(?:'s| is| are)\b)[^\n]{0,80}/gi,
    'assistant_preamble', 'Chatbot preamble ("Certainly! Here is…", "Sure, I\'d be happy to…")', 'strong'),
  R(/\bhere(?:'s| is| are)\s+(?:a|an|the|your|my)?\s*(?:revised|updated|detailed|complete|full|new|expanded|rewritten|improved|refined|brief|short)?\s*(?:version|draft|character (?:card|profile|sheet|description|bio)|description|profile|bio|greeting|first message|intro(?:duction)?|backstory|persona)s?\b(?:\s+(?:for|of)\b[^\n.:]{0,60})?\s*[:.]/gi,
    'here_is', '"Here is the character description:"', 'strong'),
  R(new RegExp(`\\b(?:i hope (?:this|that)(?: \\w+){0,3} (?:helps|works for you|fits (?:what|your)|captures (?:what|the))|let me know if you(?:'d| would)? (?:like|want|need) (?:any |me to |more |some )?(?:changes|adjustments|revisions|tweaks|${META_VERBS})|would you like me to ${META_VERBS}|if you(?:'d| would) like,? i can ${META_VERBS})\\b`, 'gi'),
    'assistant_signoff', 'Chatbot sign-off ("I hope this helps!", "Let me know if you\'d like changes")', 'strong'),
  R(/\bas an ai(?: language model)?\b(?=[^.\n]{0,40}\b(?:i|my)\b)|\bas a (?:large )?language model\b|\bi(?:'m| am) (?:just )?an ai (?:assistant|language model|model)\b|\bi (?:can(?:'t|not)|am (?:not able|unable) to) (?:create|write|generate|fulfill|produce|continue|help with|assist with|comply with|provide)\b[^.\n]{0,60}\b(?:content|request|that)\b|\bi(?:'m| am) sorry,? but i (?:can(?:'t|not)|won't|am unable to) (?:assist|help|comply|continue)\b/gi,
    'ai_self_reference', 'The generator talking about itself / refusing', 'strong'),

  // --- prompt / chat-template residue ---
  R(/<\|(?:im_start|im_end|system|user|assistant|eot_id|start_header_id|end_header_id|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>|^#{2,3}\s*(?:Instruction|Response)\s*:?\s*$/gim,
    'chat_template', 'Chat/prompt template tokens (<|im_start|>, [INST], ### Response:)', 'strong', undefined, false),
  R(/^(?:Human|User|USER)\s*:[^\n]*\n+(?:Assistant|ASSISTANT|AI|Bot)\s*:/gim,
    'chat_log', 'Human:/Assistant: transcript lines', 'note', 'Could be a pasted chat log rather than generator output.', false),
  R(/"(?:first_mes|mes_example|alternate_greetings|creator_notes|post_history_instructions)"\s*:\s*"|```json\s*\n\s*\{\s*"(?:name|description|personality|scenario|data)"\s*:/gi,
    'code_wrapper', 'JSON card-field residue ("first_mes": "…")', 'note',
    'A card pasted from a script, a model, or a raw SillyTavern/JSON export without unwrapping it.', false),
  R(/\[(?:insert|fill in|placeholder|tbd|character(?:'s)? name here|name here)\b[^\]\n]{0,40}\]|\blorem ipsum\b/gi,
    'placeholder', 'Unfilled placeholder ([Insert name], lorem ipsum)', 'note',
    'Fill-in templates meant for the user also land here; check by eye.', false),
  R(/\b(?:word|token|character) count\s*[:=]\s*~?\d+|\(\s*(?:approx(?:imately|\.)?|~)?\s*\d{2,4}\s+(?:words|tokens)\s*\)|\b(?:option|version|variant|alternative)\s+(?:[1-9]|one|two|three|a|b)\s*[:)]\s*\n/gi,
    'generation_meta', 'Word-count or "Option 1:" notes', 'note', 'Creators write token counts and options too.'),
  R(/\b(?:this|the above|the) (?:description|profile|card|character (?:sheet|profile|card)|persona|portrayal|backstory) (?:captures|highlights|showcases|blends|balances|emphasi[sz]es|provides (?:a|an)|aims to|is designed to|should (?:give|provide|allow)|creates? a|paints? a|offers? a)\b[^.\n]{0,80}|\bnote: (?:this|the) (?:character|card|description|profile) (?:is|was) (?:designed|created|generated|written|intended)\b[^.\n]{0,80}/gi,
    'meta_commentary', 'Generator commentary on its own output ("This description captures…")', 'strong'),
];

function excerpt(text, idx, len, pad = 30) {
  const a = Math.max(0, idx - pad), b = Math.min(text.length, idx + len + pad);
  return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}

// Text that stops mid-sentence: the last paragraph ends on a word with no closing
// punctuation and is long enough to be prose (max_tokens cut-off).
function truncated(text) {
  const t = text.trim();
  if (!t) return null;
  const last = t.split(/\n\s*\n/).pop().trim();
  const words = (last.match(/[A-Za-z]+/g) || []).length;
  if (words < 20) return null;
  if (/[.!?…"”'*)\]}~>;:,]\s*$/.test(last)) return null;      // ends cleanly, or list/format punctuation
  if ((last.match(/[;|{}<>]/g) || []).length > 3) return null;   // stat blocks, PLists, format specs
  // A missing final period is common in human cards; stopping on a dangling
  // function word or an em-dash mid-sentence is not.
  if (!/(?:—|\b(?:and|the|a|an|of|to|with|her|his|their|its|but|or|into|onto|which|whose))\s*$/i.test(last)) return null;
  return excerpt(last, Math.max(0, last.length - 60), 60, 0);
}

/**
 * @param {string|string[]} fields  card text, or an array of fields (description, greeting, ...)
 *                                  so the truncation check can run per field.
 * @returns {{hits: Array, points: number, strongest: string|null}}
 */
export function findArtifacts(fields) {
  const parts = Array.isArray(fields) ? fields.filter(Boolean) : [fields || ''];
  const full = parts.join('\n\n');
  const narr = stripExampleDialogue(full).replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
  const hits = [];
  for (const r of RULES) {
    const text = r.narr ? narr : full;
    r.rx.lastIndex = 0;
    let m, n = 0; const ex = [];
    while ((m = r.rx.exec(text))) { n++; if (ex.length < 3) ex.push(excerpt(text, m.index, m[0].length)); if (!m[0].length) r.rx.lastIndex++; }
    if (n) hits.push({ id: r.id, label: r.label, strength: r.strength, count: n, examples: ex, note: r.note });
  }
  const cut = parts.map(truncated).filter(Boolean);
  if (cut.length) hits.push({ id: 'truncated', label: 'Ends mid-sentence', strength: 'note', count: cut.length, examples: cut, note: 'Drafts and character limits do this too.' });

  const P = ARTIFACT_POINTS;
  const scored = hits.filter(h => h.strength === 'strong');
  const points = Math.min(P.cap, scored.length * P.strong);   // per rule, not per occurrence
  return { hits: scored, notes: hits.filter(h => h.strength === 'note'), points, strongest: scored.length ? 'strong' : null };
}
