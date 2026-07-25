/**
 * Request validation middleware
 * Validates incoming request bodies and query parameters
 */

function validateRegister(req, res, next) {
    const { name, email, password } = req.body;
    
    if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    next();
}

function validateTransaction(req, res, next) {
    const { message } = req.body;
    
    if (!message || message.length < 5) {
        return res.status(400).json({ error: 'SMS message is required and must be at least 5 characters' });
    }
    
    next();
}

function validateBusiness(req, res, next) {
    const { name } = req.body;
    
    if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Business name is required' });
    }
    
    next();
}

function validateFarm(req, res, next) {
    const { name } = req.body;
    
    if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Farm name is required' });
    }
    
    next();
}

function validateAnimal(req, res, next) {
    const { tag_id, breed, gender } = req.body;
    
    if (!tag_id) {
        return res.status(400).json({ error: 'Tag ID is required' });
    }
    
    if (!breed) {
        return res.status(400).json({ error: 'Breed is required' });
    }
    
    if (!gender || !['male', 'female'].includes(gender.toLowerCase())) {
        return res.status(400).json({ error: 'Gender must be male or female' });
    }
    
    next();
}

module.exports = {
    validateRegister,
    validateTransaction,
    validateBusiness,
    validateFarm,
    validateAnimal
};