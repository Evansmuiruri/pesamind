/**
 * M-Pesa SMS Parser
 * Supports 6 message formats: sent, received, airtime, till, withdraw, deposit
 */

const MESSAGE_PATTERNS = [
  {
    type: 'sent',
    regex: /Confirmed\.\s*Ksh\s*([\d,]+(?:\.\d{2})?)\s*sent to\s*([^\d]+?)\s*on\s*(\d{1,2}\/\d{1,2}\/\d{4}\s*\d{1,2}:\d{2}\s*[AP]M)?/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: match[2].trim(),
      date: match[3] ? new Date(match[3]) : new Date()
    })
  },
  {
    type: 'received',
    regex: /Confirmed\.\s*You have received Ksh\s*([\d,]+(?:\.\d{2})?)\s*from\s*([^\d]+?)\s*on\s*(\d{1,2}\/\d{1,2}\/\d{4}\s*\d{1,2}:\d{2}\s*[AP]M)?/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: match[2].trim(),
      date: match[3] ? new Date(match[3]) : new Date()
    })
  },
  {
    type: 'airtime',
    regex: /Confirmed\.\s*Ksh\s*([\d,]+(?:\.\d{2})?)\s*airtime\s*(?:purchased|bought)\s*on\s*(\d{1,2}\/\d{1,2}\/\d{4}\s*\d{1,2}:\d{2}\s*[AP]M)?/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: 'Airtime Purchase',
      date: match[2] ? new Date(match[2]) : new Date()
    })
  },
  {
    type: 'till',
    regex: /Confirmed\.\s*Ksh\s*([\d,]+(?:\.\d{2})?)\s*paid to\s*([^\d]+?)\s*till\s*number/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: match[2].trim(),
      date: new Date()
    })
  },
  {
    type: 'withdraw',
    regex: /Confirmed\.\s*Ksh\s*([\d,]+(?:\.\d{2})?)\s*withdrawn from\s*([^\d]+?)\s*agent/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: match[2].trim(),
      date: new Date()
    })
  },
  {
    type: 'deposit',
    regex: /Confirmed\.\s*Ksh\s*([\d,]+(?:\.\d{2})?)\s*deposited to your account\s*on\s*(\d{1,2}\/\d{1,2}\/\d{4}\s*\d{1,2}:\d{2}\s*[AP]M)?/i,
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, '')),
      counterparty: 'Account Deposit',
      date: match[2] ? new Date(match[2]) : new Date()
    })
  }
];

function parseSMS(message) {
  if (!message || typeof message !== 'string') {
    return { error: 'Invalid message input' };
  }

  const trimmed = message.trim();

  for (const pattern of MESSAGE_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      try {
        const extracted = pattern.extract(match);
        return {
          success: true,
          type: pattern.type,
          amount: extracted.amount,
          counterparty: extracted.counterparty,
          transaction_date: extracted.date.toISOString(),
          raw_message: trimmed
        };
      } catch (error) {
        return { 
          error: 'Failed to extract data from matched pattern',
          details: error.message 
        };
      }
    }
  }

  return { error: 'Unrecognized M-Pesa message format' };
}

function parseBulkSMS(messages) {
  if (!Array.isArray(messages)) {
    return { error: 'Expected array of messages' };
  }

  const results = [];
  const errors = [];

  messages.forEach((msg, index) => {
    const result = parseSMS(msg);
    if (result.success) {
      results.push(result);
    } else {
      errors.push({ index, message: msg.substring(0, 50) + '...', error: result.error });
    }
  });

  return {
    success: results.length > 0,
    total: messages.length,
    parsed: results.length,
    failed: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  };
}

module.exports = {
  parseSMS,
  parseBulkSMS,
  MESSAGE_PATTERNS
};