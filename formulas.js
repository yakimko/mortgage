/**
 * Financial calculation formulas
 * Contains core mathematical functions for mortgage, investment, and rent calculations
 */

/**
 * Format value as Polish Zloty currency
 * @param {number} v - Value to format
 * @returns {string} Formatted currency string
 */
function formatPLN(v) {
    if (v === null || v === undefined || isNaN(v)) {
        return '0,00 zł';
    }
    return Number(v).toLocaleString('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    });
}

/**
 * Format months as years with decimal precision
 * @param {number} months - Number of months
 * @returns {string} Formatted years string
 */
function formatYears(months) {
    if (months === null || months === undefined || isNaN(months)) {
        return '0 р. 0 міс.';
    }
    const totalMonths = Math.round(months);
    const years = Math.floor(totalMonths / 12);
    const remainingMonths = totalMonths % 12;
    
    if (years === 0) {
        return `${remainingMonths} міс.`;
    } else if (remainingMonths === 0) {
        return `${years} р.`;
    } else {
        return `${years} р. ${remainingMonths} міс.`;
    }
}

/**
 * Calculate annuity (fixed) monthly payment for a loan
 * Formula: P = L * [r(1+r)^n] / [(1+r)^n - 1]
 * @param {number} loan - Loan amount
 * @param {number} monthlyRate - Monthly interest rate (as decimal, e.g., 0.05 for 5%)
 * @param {number} months - Number of months
 * @returns {number} Monthly payment amount
 */
function annuityPayment(loan, monthlyRate, months) {
    const numerator = loan * monthlyRate * Math.pow(1 + monthlyRate, months);
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    return numerator / denominator;
}

/**
 * Calculate maximum loan amount from monthly payment (inverse of annuityPayment)
 * Formula: L = P * [(1+r)^n - 1] / [r(1+r)^n]
 * @param {number} monthlyPayment - Monthly payment amount
 * @param {number} monthlyRate - Monthly interest rate (as decimal, e.g., 0.05 for 5%)
 * @param {number} months - Number of months
 * @returns {number} Maximum loan amount
 */
function maxLoanFromPayment(monthlyPayment, monthlyRate, months) {
    if (monthlyRate === 0) {
        return monthlyPayment * months;
    }
    const numerator = monthlyPayment * (Math.pow(1 + monthlyRate, months) - 1);
    const denominator = monthlyRate * Math.pow(1 + monthlyRate, months);
    return numerator / denominator;
}

/**
 * Calculate mortgage schedule with early repayment
 * Tracks balance reduction over time with optional extra payments
 * @param {number} loan - Initial loan amount
 * @param {number} monthlyRate - Monthly interest rate (as decimal)
 * @param {number} basePayment - Base monthly payment
 * @param {number} extra - Extra payment amount (reduces principal)
 * @param {number} maxMonths - Maximum number of months to calculate
 * @returns {Object} Object with balances array, monthsUsed, and totalPaid
 */
function mortgageSchedule(loan, monthlyRate, basePayment, extra, maxMonths) {
    let balance = loan;
    let balances = [];
    let totalPaid = 0;

    for (let m = 0; m < maxMonths; m++) {
        // Calculate interest for current period
        const interest = balance * monthlyRate;
        
        // Principal payment from base payment
        const principalPayment = basePayment - interest;
        
        // Early repayment reduces balance directly
        balance = balance - principalPayment - extra;
        
        if (balance < 0) balance = 0;
        
        balances.push(balance);
        totalPaid += basePayment + extra;
        
        if (balance <= 0) break;
    }

    const monthsUsed = balances.length;
    return { balances, monthsUsed, totalPaid };
}

/**
 * Calculate investment schedule with quarterly dividends and end-period tax
 * Dividends are paid quarterly, taxed immediately, and NOT reinvested
 * Tax on capital gains is applied at the end of the period
 * @param {number} monthly - Monthly investment amount
 * @param {number} annualRate - Annual return rate (as percentage, e.g., 7 for 7%)
 * @param {number} taxPct - Tax rate on profit (as percentage, e.g., 19 for 19%)
 * @param {number} months - Number of months to calculate
 * @param {number} dividendsPct - Annual dividend rate (as percentage, default 0)
 * @returns {Array} Array of balance values for each month
 */
function investSchedule(monthly, annualRate, taxPct, months, dividendsPct = 0) {
    // Monthly rate without tax (tax applied at end)
    const monthlyRate = annualRate / 12 / 100;
    
    // Quarterly dividend rate (annual rate / 4)
    const quarterlyDividendRate = dividendsPct / 4 / 100;
    
    let balance = 0;
    let balances = [];

    for (let m = 0; m < months; m++) {
        // Compound interest + monthly contribution
        balance = balance * (1 + monthlyRate) + monthly;
        
        // Dividends paid quarterly (months 3, 6, 9, 12...)
        // Dividends are NOT reinvested - they are paid out and taxed immediately
        if ((m + 1) % 3 === 0 && dividendsPct > 0) {
            const dividends = balance * quarterlyDividendRate;
            // Tax on dividends is applied immediately
            const dividendsAfterTax = dividends * (1 - taxPct / 100);
            // Dividends are paid out, NOT added to balance
            // Balance remains unchanged (dividends are separate income)
        }
        
        balances.push(balance);
    }

    // Tax applied at end of period on capital gains (profit from growth)
    if (taxPct > 0 && balance > 0) {
        const totalInvested = monthly * months;
        const profit = balance - totalInvested;
        
        if (profit > 0) {
            const tax = profit * (taxPct / 100);
            balance = balance - tax;
            // Update last value in array
            balances[balances.length - 1] = balance;
        }
    }

    return balances;
}

/**
 * Calculate rent schedule with annual growth
 * Rent and utilities grow annually at specified rates
 * @param {number} base - Base rent amount (monthly)
 * @param {number} utilities - Utilities amount (monthly)
 * @param {number} growthBase - Annual rent growth rate (as percentage)
 * @param {number} growthUtil - Annual utilities growth rate (as percentage)
 * @param {number} months - Number of months to calculate
 * @returns {Array} Array of total monthly costs (rent + utilities)
 */
function rentSchedule(base, utilities, growthBase, growthUtil, months) {
    let b = base;
    let u = utilities;
    let res = [];

    for (let m = 0; m < months; m++) {
        res.push(b + u);
        
        // Apply growth annually (every 12 months)
        if ((m + 1) % 12 === 0) {
            b *= 1 + growthBase / 100;
            u *= 1 + growthUtil / 100;
        }
    }

    return res;
}
