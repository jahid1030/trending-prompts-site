// scripts/fetch-prompts.js
const fs = require('fs');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const parser = new Parser({ customFields: { item: ['content', 'content:encoded'] } });

const SUBREDDIT_FEEDS = [
  'https://www.reddit.com/r/StableDiffusion/.rss',
  'https://www.reddit.com/r/midjourney/.rss',
  'https://www.reddit.com/r/AIArt/.rss'
];

function extractPromptsFromText(text){
  if(!text) return [];
  const out = new Set();
  // 1) code blocks ``` ... ```
  const codeRe = /```([\s\S]*?)```/g;
  let m;
  while((m = codeRe.exec(text)) !== null){
    const t = m[1].trim();
    if(t.length>20) out.add(t);
  }
  // 2) lines starting with "Prompt:" or "prompt:"
  const lines = text.split(/\r?\n/);
  for(const L of lines){
    const l = L.trim();
    const pMatch = l.match(/^(?:Prompt|prompt)[:\-]\s*(.+)/);
    if(pMatch && pMatch[1].length>20) out.add(pMatch[1].trim());
  }
  // 3) fallback: long lines
  for(const L of lines){
    const t = L.trim();
    if(t.length>80 && t.split(' ').length>6) out.add(t);
  }
  return Array.from(out).map(s=>s.replace(/\s+/g,' ').trim());
}

(async ()=>{
  try{
    const prompts = [];
    for(const feedUrl of SUBREDDIT_FEEDS){
      try {
        // fetch RSS with a UA
        const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; prompt-fetcher/1.0)' }});
        if(!res.ok) { console.warn('Feed not ok', feedUrl, res.status); continue; }
        const text = await res.text();
        const feed = await parser.parseString(text);
        for(const item of feed.items || []){
          const content = (item['content:encoded'] || item.content || item.contentSnippet || item.title || '');
          const found = extractPromptsFromText(content + '\n' + (item.title||''));
          found.forEach(p => prompts.push(p));
        }
      } catch(err){
        console.warn('Error fetching feed', feedUrl, err.message || err);
      }
    }

    // dedupe & score (simple: first seen priority), keep unique
    const unique = [];
    const seen = new Set();
    for(const p of prompts){
      const key = p.toLowerCase().slice(0,400);
      if(!seen.has(key)){
        seen.add(key);
        unique.push(p);
      }
      if(unique.length >= 50) break;
    }

    // final object
    const out = { updated: new Date().toISOString(), prompts: unique };
    fs.writeFileSync('prompts.json', JSON.stringify(out, null, 2));
    console.log('Wrote', unique.length, 'prompts');
    process.exit(0);
  } catch(err){
    console.error(err);
    process.exit(2);
  }
  
})();
