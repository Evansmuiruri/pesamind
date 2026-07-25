/**
 * Agriculture SMS Parser
 * Maps M-Pesa SMS to agriculture input categories for auto-logging
 */

const { parseSMS } = require('./mpesa');

// Agriculture-specific keyword mapping
const AGRI_KEYWORDS = {
    'seed': ['SEED', 'HYBRID', 'MAIZE SEED', 'BEAN SEED', 'CERTIFIED SEED', 'SEEDLING'],
    'fertilizer': ['DAP', 'CAN', 'NPK', 'UREA', 'YARA', 'FERTILIZER', 'FERT', 'COMPOUND'],
    'pesticide': ['INSECTICIDE', 'FUNGICIDE', 'PESTICIDE', 'SPRAY', 'ACREATE', 'AGRICHEM'],
    'herbicide': ['HERBICIDE', 'WEED', 'ROUNDUP', 'GLYPHOSATE', 'WEEDICIDE'],
    'labour': ['LABOUR', 'WORKER', 'HARVESTER', 'PLANTER', 'WEEDER', 'CASUAL', 'WAGES'],
    'machinery': ['TRACTOR', 'HARVESTER', 'TILLER', 'MACHINERY', 'HIRE', 'PTO'],
    'transport': ['TRANSPORT', 'DELIVERY', 'LOGISTICS', 'HAULAGE', 'CARRIER'],
    'storage': ['STORAGE', 'WAREHOUSE', 'SILO', 'GUNNY BAG', 'STORAGE BAG'],
    'irrigation': ['IRRIGATION', 'SPRINKLER', 'DRIP', 'WATER PUMP', 'PIPE'],
    'veterinary': ['VET', 'VACCINE', 'DEWORMER', 'ANIMAL HEALTH', 'LIVESTOCK']
};

function parseAgricultureSMS(message) {
    // First parse as regular M-Pesa
    const mpesaResult = parseSMS(message);
    
    if (!mpesaResult.success) {
        return mpesaResult;
    }
    
    // Determine if it's an agriculture-related transaction
    const counterparty = (mpesaResult.counterparty || '').toUpperCase();
    const fullMessage = message.toUpperCase();
    
    let inputType = null;
    let confidence = 'low';
    let matchedKeyword = null;
    
    // Check each agriculture category
    for (const [type, keywords] of Object.entries(AGRI_KEYWORDS)) {
        for (const keyword of keywords) {
            if (counterparty.includes(keyword) || fullMessage.includes(keyword)) {
                inputType = type;
                matchedKeyword = keyword;
                confidence = counterparty.includes(keyword) ? 'high' : 'medium';
                break;
            }
        }
        if (inputType) break;
    }
    
    // Extract quantity if present
    const quantity = extractQuantity(fullMessage);
    const unit = extractUnit(fullMessage);
    
    return {
        ...mpesaResult,
        is_agriculture: !!inputType,
        input_type: inputType,
        confidence: confidence,
        matched_keyword: matchedKeyword,
        quantity: quantity,
        unit: unit,
        // For direct input logging
        total_cost: mpesaResult.amount,
        purchase_date: mpesaResult.transaction_date,
        supplier: mpesaResult.counterparty
    };
}

function extractQuantity(message) {
    // Try to extract quantity from message
    const patterns = [
        /(\d+)\s*(?:kg|kgs|kilogram)/i,
        /(\d+)\s*(?:litre|litres|l)/i,
        /(\d+)\s*(?:bag|bags)/i,
        /(\d+)\s*(?:acre|acres)/i,
        /(\d+)\s*(?:liters?)/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            return parseFloat(match[1]);
        }
    }
    return null;
}

function extractUnit(message) {
    const patterns = [
        /(\d+)\s*(kg|kgs|kilogram)/i,
        /(\d+)\s*(litre|litres|l|liters?)/i,
        /(\d+)\s*(bag|bags)/i,
        /(\d+)\s*(acre|acres)/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            return match[2].toLowerCase();
        }
    }
    return null;
}

function parseBulkAgricultureSMS(messages) {
    if (!Array.isArray(messages)) {
        return { error: 'Expected array of messages' };
    }
    
    const results = [];
    const errors = [];
    const agricultureItems = [];
    
    messages.forEach((msg, index) => {
        const result = parseAgricultureSMS(msg);
        if (result.success) {
            results.push(result);
            if (result.is_agriculture) {
                agricultureItems.push({
                    ...result,
                    index
                });
            }
        } else {
            errors.push({ index, message: msg.substring(0, 50) + '...', error: result.error });
        }
    });
    
    return {
        success: results.length > 0,
        total: messages.length,
        parsed: results.length,
        agriculture_items: agricultureItems.length,
        results,
        agriculture_items_list: agricultureItems,
        errors: errors.length > 0 ? errors : undefined
    };
}

module.exports = {
    parseAgricultureSMS,
    parseBulkAgricultureSMS,
    AGRI_KEYWORDS
};