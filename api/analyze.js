module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { action, text, image, imageType, products } = req.body || {};

  let messages;

  if (action === 'analyze_image' && image) {
    messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: imageType || 'image/jpeg', data: image }
        },
        {
          type: 'text',
          text: `请分析图片中的护肤品成分表，严格以JSON格式返回（不含任何其他文字）：
{"product_name":"产品名（如不可见填空字符串）","key_ingredients":[{"name":"成分名","role":"功效类型","benefit":"益处","concern":"风险或null"}],"skin_type_suitable":["干性","油性","混合性","敏感性","中性"中适合的],"safety_rating":0到10的整数,"summary":"2-3句综合评价","warnings":["注意事项，无则空数组"]}`
        }
      ]
    }];
  } else if (action === 'analyze_text' && text) {
    messages = [{
      role: 'user',
      content: `分析以下护肤品成分，严格以JSON格式返回（不含任何其他文字）：
成分：${text}

格式：{"product_name":"","key_ingredients":[{"name":"","role":"","benefit":"","concern":null}],"skin_type_suitable":[],"safety_rating":0,"summary":"","warnings":[]}`
    }];
  } else if (action === 'generate_routine' && products) {
    messages = [{
      role: 'user',
      content: `基于以下护肤品生成最优早晚护肤程序，严格以JSON格式返回（不含任何其他文字）：
产品：${JSON.stringify(products)}

格式：{"morning":[{"step":1,"product_name":"","usage":"使用方法","tips":"注意事项"}],"evening":[{"step":1,"product_name":"","usage":"","tips":""}],"notes":"整体建议"}`
    }];
  } else if (action === 'check_conflicts' && products) {
    messages = [{
      role: 'user',
      content: `检查以下护肤品之间的成分冲突，严格以JSON格式返回（不含任何其他文字）：
产品：${JSON.stringify(products)}

格式：{"has_conflicts":true或false,"conflicts":[{"products":["产品A","产品B"],"conflicting_ingredients":["成分1"],"reason":"冲突原因","severity":"high或medium或low","suggestion":"建议"}],"overall_assessment":"综合评估"}`
    }];
  } else {
    return res.status(400).json({ error: 'Invalid action or missing parameters' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    let content = data.content[0].text.trim();

    // Strip markdown code fences if Claude wraps response in them
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return res.status(200).json({ result: JSON.parse(content) });
    } catch {
      return res.status(200).json({ result: content });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
