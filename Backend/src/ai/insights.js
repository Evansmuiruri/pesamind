const { GoogleGenerativeAI } = require('@google/generative-ai');

// Deterministic fallback engine
function generateFallbackInsights(summary, transactions) {
  const { total_income, total_expenses, balance, total_transactions } = summary;
  
  const insights = [];
  
  insights.push(`📊 You had ${total_transactions} transactions in this period.`);
  insights.push(`💰 Total income: KSh ${total_income.toFixed(2)}`);
  insights.push(`💸 Total expenses: KSh ${total_expenses.toFixed(2)}`);
  insights.push(`📈 Net balance: KSh ${balance.toFixed(2)}`);
  
  if (balance > 0) {
    insights.push(`✅ You're spending less than you earn. Keep it up!`);
  } else if (balance < 0) {
    insights.push(`⚠️ You're spending more than you earn. Review your expenses.`);
  } else {
    insights.push(`📊 Your income and expenses are balanced.`);
  }
  
  if (transactions && transactions.length > 0) {
    const topCategory = transactions[0];
    insights.push(`🏷️ Top spending category: ${topCategory.category} (KSh ${topCategory.total.toFixed(2)})`);
    
    if (topCategory.total > total_expenses * 0.3) {
      insights.push(`💡 Your top category accounts for over 30% of expenses. Consider optimizing this area.`);
    }
  }
  
  return insights;
}

async function generateGeminiInsights(summary, transactions, apiKey) {
  if (!apiKey) {
    return generateFallbackInsights(summary, transactions);
  }
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `
      You are Pesa Mind, a financial assistant for Kenyan users. 
      Analyze this financial summary and provide helpful insights in plain English.
      
      Summary:
      - Period: ${summary.period || 'current'}
      - Total Income: KSh ${summary.total_income.toFixed(2)}
      - Total Expenses: KSh ${summary.total_expenses.toFixed(2)}
      - Net Balance: KSh ${summary.balance.toFixed(2)}
      - Total Transactions: ${summary.total_transactions}
      
      Top Spending Categories:
      ${transactions.slice(0, 5).map(t => `- ${t.category}: KSh ${t.total.toFixed(2)} (${t.count} transactions)`).join('\n')}
      
      Provide:
      1. A brief summary of their financial health
      2. Identify any concerning spending patterns
      3. One actionable suggestion
      4. Keep it conversational and encouraging
      
      Response format: plain text, 3-4 short paragraphs.
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    return text.split('\n').filter(line => line.trim().length > 0);
    
  } catch (error) {
    console.error('Gemini API error:', error);
    return generateFallbackInsights(summary, transactions);
  }
}

module.exports = {
  generateFallbackInsights,
  generateGeminiInsights
};