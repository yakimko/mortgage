/**
 * Main application logic
 * Handles UI interactions and orchestrates calculations for three housing/investment scenarios
 */

let chart;

/**
 * Main recalculation function
 * Reads input values, performs calculations for all three scenarios, and updates UI
 */
function recalc() {
    // Check if we're on the main comparison page
    const mortgageAmountEl = document.getElementById('mortgageAmount');
    if (!mortgageAmountEl) {
        return; // Not on main comparison page, skip calculation
    }
    
    // Read all input values
    const inputs = {
        mortgageAmount: +mortgageAmountEl.value,
        mortgageDown: +document.getElementById('mortgageDown').value,
        mortgageRate: +document.getElementById('mortgageRate').value,
        mortgageYears: +document.getElementById('mortgageYears').value,
        extraAmount: +document.getElementById('extraAmount').value,
        extraPct: +document.getElementById('extraPct').value,
        mortgageCosts: +document.getElementById('mortgageCosts').value,
        mortgageGrowth: +document.getElementById('mortgageGrowth').value,
        investRate: +document.getElementById('investRate').value,
        investTax: +document.getElementById('investTax').value,
        dividends: +document.getElementById('dividends').value,
        rentBase: +document.getElementById('rentBase').value,
        utilities: +document.getElementById('utilities').value,
        rentGrowth: +document.getElementById('rentGrowth').value,
        utilitiesGrowth: +document.getElementById('utilitiesGrowth').value,
        solvency: +document.getElementById('solvency').value
    };

    // Calculate basic mortgage parameters
    const loan = inputs.mortgageAmount * (1 - inputs.mortgageDown / 100);
    const monthlyRate = inputs.mortgageRate / 12 / 100;
    const monthsTotal = inputs.mortgageYears * 12;
    const maxMonths = inputs.solvency * 12;
    
    // Calculation period = MINIMUM of (Mortgage term; Solvency period)
    const stepMonths = Math.min(monthsTotal, maxMonths);

    const basePayment = annuityPayment(loan, monthlyRate, monthsTotal);
    const rentMonthly = inputs.rentBase + inputs.utilities;
    
    // Total extra payment amount (use extraAmount if provided, otherwise use rent as default)
    const totalExtra = inputs.extraAmount > 0 ? inputs.extraAmount : rentMonthly;
    
    // Option 1: 100% to early repayment
    const extra1 = totalExtra;
    
    // Option 2: X% to early repayment, (100%-X%) to parallel investment
    // For option 2, percentage is applied to extraAmount field (not rentMonthly)
    const extraAmountForOption2 = inputs.extraAmount;
    const extra2 = extraAmountForOption2 * (inputs.extraPct / 100);
    const investExtra2 = extraAmountForOption2 * (1 - inputs.extraPct / 100);

    // Update monthly payment display
    document.getElementById('monthlyPayment').innerText = 
        'Обов\'язковий щомісячний платіж по іпотеці: ' + formatPLN(basePayment);

    const tbody = document.querySelector('#result tbody');
    tbody.innerHTML = '';

    // Calculate mortgage schedules (without maxMonths limit to determine actual repayment period)
    let fullPayment = mortgageSchedule(loan, monthlyRate, basePayment, extra1, monthsTotal * 2);
    let partialPayment = mortgageSchedule(loan, monthlyRate, basePayment, extra2, monthsTotal * 2);

    // Check: if calculated repayment period exceeds solvency - mark as impossible
    if (fullPayment.monthsUsed > maxMonths) {
        fullPayment = null;
    }
    if (partialPayment.monthsUsed > maxMonths) {
        partialPayment = null;
    }

    // ============================================================================
    // SCENARIO 1: Mortgage and subsequent investment
    // All extra payment goes to early repayment, after mortgage - full amount to investment
    // ============================================================================
    let invest1 = [];
    let expenses1 = 0;
    let houseValue1 = 0;
    
    if (fullPayment) {
        // Mortgage repayment period
        const mortgageMonths = Math.min(fullPayment.monthsUsed, maxMonths);
        
        // Calculation period = full solvency period (maxMonths) for investments
        // Investments continue after mortgage repayment until end of solvency period
        const period1 = maxMonths;
        
        // No investments during mortgage repayment
        for (let i = 0; i < mortgageMonths; i++) {
            invest1.push(0);
        }
        
        // After mortgage repayment, full amount (payment + extra) goes to investment
        // Calculate investments until end of solvency period
        const investMonthly = basePayment + totalExtra;
        const monthsAfter = period1 - mortgageMonths;
        
        if (monthsAfter > 0) {
            invest1 = invest1.concat(
                investSchedule(investMonthly, inputs.investRate, inputs.investTax, monthsAfter, inputs.dividends)
            );
        }
        
        // Expenses calculated only for actual mortgage repayment period
        const monthsPaid = Math.min(fullPayment.monthsUsed, maxMonths);
        expenses1 = (basePayment + extra1) * monthsPaid + inputs.mortgageCosts;
        
        // House value calculated for full period1 (maxMonths)
        houseValue1 = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts) *
            Math.pow(1 + inputs.mortgageGrowth / 100, period1 / 12);
    }

    // ============================================================================
    // SCENARIO 2: Mortgage + parallel investment
    // X% of extra payment to early repayment, (100%-X%) to parallel investment
    // After mortgage repayment, full amount (payment + 100% extra) goes to investment
    // ============================================================================
    let invest2 = [];
    let expenses2 = 0;
    let houseValue2 = 0;
    
    if (partialPayment) {
        // Mortgage repayment period
        const mortgageMonths = Math.min(partialPayment.monthsUsed, maxMonths);
        
        // Calculation period = full solvency period (maxMonths) for investments
        // Investments continue after mortgage repayment until end of solvency period
        const period2 = maxMonths;
        
        // During mortgage: parallel investment of (100%-X%) extra payment
        const investDuring = investSchedule(
            investExtra2, 
            inputs.investRate, 
            inputs.investTax, 
            mortgageMonths, 
            inputs.dividends
        );
        
        // Accumulated investment balance at mortgage end (before tax, tax applied at end)
        const investBalanceAtEnd = investDuring[investDuring.length - 1];
        
        // Total invested during mortgage period
        const totalInvestedDuring = investExtra2 * mortgageMonths;
        
        // After mortgage: full amount (payment + 100% extra) goes to investment
        // Calculate investments until end of solvency period
        const investMonthly = basePayment + totalExtra;
        const monthsAfter = period2 - mortgageMonths;
        
        // Combine: investments during mortgage + investments after repayment
        // Tax not applied monthly, only at end
        const monthlyRate = inputs.investRate / 12 / 100;
        const quarterlyDividendRate = inputs.dividends / 4 / 100;
        invest2 = investDuring.slice();
        
        // Calculate investments after repayment: accumulated balance grows + new contributions
        let currentBalance = investBalanceAtEnd;
        for (let i = 0; i < monthsAfter; i++) {
            currentBalance = currentBalance * (1 + monthlyRate) + investMonthly;
            
            // Dividends paid quarterly (NOT reinvested - they are paid out and taxed separately)
            if ((mortgageMonths + i + 1) % 3 === 0 && inputs.dividends > 0) {
                const dividends = currentBalance * quarterlyDividendRate;
                // Tax on dividends applied immediately, but dividends are NOT added to balance
                // Balance remains unchanged (dividends are separate income, not reinvested)
            }
            invest2.push(currentBalance);
        }
        
        // Save balance before tax for chart extension
        const invest2BalanceBeforeTax = invest2[invest2.length - 1];
        
        // Tax applied at end of period on total profit
        if (inputs.investTax > 0 && invest2[invest2.length - 1] > 0) {
            const totalInvested = totalInvestedDuring + investMonthly * monthsAfter;
            const profit = invest2[invest2.length - 1] - totalInvested;
            
            if (profit > 0) {
                const tax = profit * (inputs.investTax / 100);
                invest2[invest2.length - 1] = invest2[invest2.length - 1] - tax;
            }
        }
        
        // Expenses calculated only for actual mortgage repayment period
        expenses2 = (basePayment + extra2) * mortgageMonths + inputs.mortgageCosts;
        
        // House value calculated for full period2 (maxMonths)
        houseValue2 = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts) *
            Math.pow(1 + inputs.mortgageGrowth / 100, period2 / 12);
    }

    // ============================================================================
    // SCENARIO 3: Rent + investment
    // For investment, use potential mandatory mortgage payment amount
    // ============================================================================
    const rent = rentSchedule(
        inputs.rentBase, 
        inputs.utilities, 
        inputs.rentGrowth, 
        inputs.utilitiesGrowth, 
        stepMonths
    );
    const invest3 = investSchedule(
        basePayment, 
        inputs.investRate, 
        inputs.investTax, 
        stepMonths, 
        inputs.dividends
    );
    const expenses3 = rent.reduce((a, b) => a + b, 0);

    // "Net worth" = assets (investments + house) minus only rent expenses
    // Mortgage expenses not subtracted, as they gave us the house
    const totals = [
        fullPayment ? invest1[invest1.length - 1] + houseValue1 : null,
        partialPayment ? invest2[invest2.length - 1] + houseValue2 : null,
        invest3[invest3.length - 1] - expenses3  // For rent, subtract expenses as it's just a loss
    ];

    const maxTotal = Math.max(...totals.filter(v => v !== null));
    const minTotal = Math.min(...totals.filter(v => v !== null));

    function cellClass(i) {
        if (totals[i] === null) return 'na';
        if (totals[i] === maxTotal) return 'best';
        if (totals[i] === minTotal) return 'worst';
        return '';
    }

    // Build results table
    tbody.innerHTML += `
        <tr>
            <td>Разові витрати на іпотечне житло (PLN)</td>
            <td>${fullPayment ? formatPLN(expenses1) : '<span class="na">неможливо</span>'}</td>
            <td>${partialPayment ? formatPLN(expenses2) : '<span class="na">неможливо</span>'}</td>
            <td>0</td>
        </tr>
        <tr>
            <td>Витрати на оренду (PLN)</td>
            <td>0</td>
            <td>0</td>
            <td>${formatPLN(expenses3)}</td>
        </tr>
        <tr>
            <td>Інвестиції (прибуток, PLN)</td>
            <td>${fullPayment ? formatPLN(invest1[invest1.length - 1]) : '<span class="na">—</span>'}</td>
            <td>${partialPayment ? formatPLN(invest2[invest2.length - 1]) : '<span class="na">—</span>'}</td>
            <td>${formatPLN(invest3[invest3.length - 1])}</td>
        </tr>
        <tr>
            <td>Вартість квартири на кінець (PLN)</td>
            <td>${fullPayment ? formatPLN(houseValue1) : '<span class="na">—</span>'}</td>
            <td>${partialPayment ? formatPLN(houseValue2) : '<span class="na">—</span>'}</td>
            <td>0</td>
        </tr>
        <tr>
            <td>Прибуток (PLN)</td>
            <td class="${cellClass(0)}">${fullPayment ? formatPLN(totals[0]) : '<span class="na">неможливо</span>'}</td>
            <td class="${cellClass(1)}">${partialPayment ? formatPLN(totals[1]) : '<span class="na">неможливо</span>'}</td>
            <td class="${cellClass(2)}">${formatPLN(totals[2])}</td>
        </tr>
        <tr>
            <td>Термін (роки)</td>
            <td>${fullPayment ? formatYears(Number(Math.min(fullPayment.monthsUsed || 0, maxMonths))) : '<span class="na">неможливо</span>'}</td>
            <td>${partialPayment ? formatYears(Number(Math.min(partialPayment.monthsUsed || 0, maxMonths))) : '<span class="na">неможливо</span>'}</td>
            <td>${formatYears(Number(stepMonths))}</td>
        </tr>
    `;

    // ============================================================================
    // CHART: Period for each scenario = full solvency period (maxMonths)
    // Shows full period including investment phase after mortgage repayment
    // Add 6 months buffer to avoid abrupt cutoff
    // ============================================================================
    const chartMonths1 = fullPayment ? maxMonths : 0;
    const chartMonths2 = partialPayment ? maxMonths : 0;
    const chartMonths3 = stepMonths;
    
    // Determine maximum period for chart (so all scenarios are on same scale)
    // Add 6 months buffer to avoid abrupt cutoff
    const maxChartMonths = Math.max(chartMonths1, chartMonths2, chartMonths3) + 6;
    
    // Format label for X axis: show years and months
    function formatPeriodLabel(months) {
        const years = Math.floor(months / 12);
        const monthsRem = months % 12;
        if (years === 0) {
            return `${months} міс`;
        } else if (monthsRem === 0) {
            return `${years} р.`;
        } else {
            return `${years} р. ${monthsRem} міс`;
        }
    }
    
    // Create labels for chart (every 6 months)
    const labels = [];
    for (let i = 0; i < maxChartMonths; i += 6) {
        labels.push(formatPeriodLabel(i + 1));
    }
    
    function downsample(arr, maxLength) {
        // Extend array to maxLength if needed (extrapolate last value)
        const extended = arr.slice();
        while (extended.length < maxLength) {
            extended.push(extended.length > 0 ? extended[extended.length - 1] : 0);
        }
        return extended.slice(0, maxLength).filter((v, i) => i % 6 === 0);
    }
    
    const datasets = [];
    
    // Scenario 1: investments + house value (grows over ownership period)
    if (fullPayment && chartMonths1 > 0) {
        const houseValueGrowth = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts);
        
        const period1 = Math.min(fullPayment.monthsUsed, maxMonths);
        const mortgageMonths = Math.min(fullPayment.monthsUsed, period1);
        
        // Build invest1Chart: investments during and after mortgage
        let invest1Chart = [];
        
        // During mortgage: no investments
        for (let i = 0; i < mortgageMonths && i < chartMonths1; i++) {
            invest1Chart.push(0);
        }
        
        // After mortgage repayment: calculate investments for full chart period
        if (mortgageMonths < chartMonths1) {
            const investMonthly = basePayment + totalExtra;
            const monthsAfter = chartMonths1 - mortgageMonths;
            
            // Use investSchedule to calculate investments after mortgage
            const investAfter = investSchedule(
                investMonthly, 
                inputs.investRate, 
                inputs.investTax, 
                monthsAfter, 
                inputs.dividends
            );
            invest1Chart = invest1Chart.concat(investAfter);
        }
        
        // Map to include house value only after mortgage is paid off
        // House value grows from purchase date, but shown only after mortgage repayment
        const chartData = invest1Chart.map((v, i) => {
            const months = i + 1;
            // Add house value only after mortgage is fully paid
            if (months > mortgageMonths) {
                const currentHouseValue = houseValueGrowth * 
                    Math.pow(1 + inputs.mortgageGrowth / 100, months / 12);
                return v + currentHouseValue;
            } else {
                // During mortgage: only investments (no house value shown)
                return v;
            }
        });
        
        // Extend with last value for visual buffer (no recalculation)
        const lastValue = chartData.length > 0 ? chartData[chartData.length - 1] : 0;
        while (chartData.length < maxChartMonths) {
            chartData.push(lastValue);
        }
        
        datasets.push({
            label: 'Повна переплата → інвестиції',
            data: downsample(chartData, maxChartMonths),
            borderColor: 'red',
            fill: false
        });
    }
    
    // Scenario 2: investments + house value (grows over ownership period)
    if (partialPayment && chartMonths2 > 0) {
        const houseValueGrowth = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts);
        
        // Use already calculated invest2 (only up to chartMonths2, no recalculation)
        let invest2Chart = invest2.slice(0, chartMonths2);
        
        // Get mortgage repayment period
        const period2 = Math.min(partialPayment.monthsUsed, maxMonths);
        const mortgageMonths2 = Math.min(partialPayment.monthsUsed, period2);
        
        // Map to include house value only after mortgage is paid off
        // House value grows from purchase date, but shown only after mortgage repayment
        const chartData = invest2Chart.map((v, i) => {
            const months = i + 1;
            // Add house value only after mortgage is fully paid
            if (months > mortgageMonths2) {
                const currentHouseValue = houseValueGrowth * 
                    Math.pow(1 + inputs.mortgageGrowth / 100, months / 12);
                return v + currentHouseValue;
            } else {
                // During mortgage: only investments (no house value shown)
                return v;
            }
        });
        
        // Extend with last value for visual buffer (no recalculation)
        const lastValue = chartData.length > 0 ? chartData[chartData.length - 1] : 0;
        while (chartData.length < maxChartMonths) {
            chartData.push(lastValue);
        }
        
        datasets.push({
            label: 'Переплата + паралельне інвестування',
            data: downsample(chartData, maxChartMonths),
            borderColor: 'orange',
            fill: false
        });
    }
    
    // Scenario 3: investments minus accumulated rent expenses (profit on hand)
    let invest3Chart = invest3.slice(0, chartMonths3);
    
    // Calculate accumulated rent expenses (cumulative sum)
    let accumulatedRent = [];
    let rentSum = 0;
    for (let i = 0; i < Math.min(rent.length, chartMonths3); i++) {
        rentSum += rent[i];
        accumulatedRent.push(rentSum);
    }
    
    // Extend rent array if needed
    while (accumulatedRent.length < chartMonths3) {
        accumulatedRent.push(rentSum);
    }
    
    // Profit on hand = investments - accumulated rent expenses
    const profit3Chart = invest3Chart.map((v, i) => {
        return v - (accumulatedRent[i] || 0);
    });
    
    // Extend with last value for visual buffer (no recalculation)
    const lastValue3 = profit3Chart.length > 0 ? profit3Chart[profit3Chart.length - 1] : 0;
    while (profit3Chart.length < maxChartMonths) {
        profit3Chart.push(lastValue3);
    }
    
    datasets.push({
        label: 'Оренда + інвестиції',
        data: downsample(profit3Chart, maxChartMonths),
        borderColor: 'green',
        fill: false
    });

    // Update chart
    if (chart) chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Динаміка прибутку',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: { 
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                y: {
                    title: { 
                        display: true, 
                        text: 'Прибуток (PLN)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('uk-UA') + ' PLN';
                        }
                    }
                },
                x: {
                    title: { 
                        display: true, 
                        text: 'Період (роки та місяці)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0
                    }
                }
            }
        }
    });
}

/**
 * Save all input values to localStorage
 */
function saveToLocalStorage() {
    const inputs = [
        'mortgageAmount', 'mortgageDown', 'mortgageRate', 'mortgageYears',
        'extraAmount', 'extraPct', 'mortgageCosts', 'mortgageGrowth',
        'investRate', 'investTax', 'dividends',
        'rentBase', 'utilities', 'rentGrowth', 'utilitiesGrowth',
        'solvency'
    ];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            localStorage.setItem(`ipoteka_${id}`, element.value);
        }
    });
}

/**
 * Load all input values from localStorage
 */
function loadFromLocalStorage() {
    const inputs = [
        'mortgageAmount', 'mortgageDown', 'mortgageRate', 'mortgageYears',
        'extraAmount', 'extraPct', 'mortgageCosts', 'mortgageGrowth',
        'investRate', 'investTax', 'dividends',
        'rentBase', 'utilities', 'rentGrowth', 'utilitiesGrowth',
        'solvency'
    ];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const savedValue = localStorage.getItem(`ipoteka_${id}`);
            if (savedValue !== null) {
                element.value = savedValue;
            }
        }
    });
}

// Initialize: load saved data, attach event listeners and perform initial calculation
loadFromLocalStorage();
document.querySelectorAll('input').forEach(i => {
    i.addEventListener('input', () => {
        saveToLocalStorage();
        recalc();
    });
});
recalc();

// ============================================================================
// SCENARIO COMPARISON FUNCTIONALITY
// ============================================================================

let scenariosChart;

/**
 * Sync values from main form to scenarios form
 * Only sync if scenario field is empty or 0
 * Can sync from DOM elements or from localStorage
 */
function syncToScenariosForm() {
    const mappings = [
        { from: 'mortgageAmount', to: 'scenarioMortgageAmount' },
        { from: 'mortgageDown', to: 'scenarioMortgageDown' },
        { from: 'mortgageRate', to: 'scenarioMortgageRate' },
        { from: 'mortgageCosts', to: 'scenarioMortgageCosts' },
        { from: 'mortgageGrowth', to: 'scenarioMortgageGrowth' },
        { from: 'investTax', to: 'scenarioInvestTax' },
        { from: 'dividends', to: 'scenarioDividends' },
        { from: 'rentBase', to: 'scenarioRentBase' },
        { from: 'utilities', to: 'scenarioUtilities' },
        { from: 'rentGrowth', to: 'scenarioRentGrowth' },
        { from: 'utilitiesGrowth', to: 'scenarioUtilitiesGrowth' }
    ];
    
    mappings.forEach(({ from, to }) => {
        const toEl = document.getElementById(to);
        if (!toEl) return;
        
        // Only sync if scenario field is empty, null, undefined, or '0'
        const scenarioValue = toEl.value;
        const isEmpty = !scenarioValue || scenarioValue.trim() === '' || scenarioValue === '0';
        
        if (!isEmpty) {
            return; // Field already has value, don't overwrite
        }
        
        // Try to get value from DOM element first
        const fromEl = document.getElementById(from);
        if (fromEl && fromEl.value && fromEl.value.trim() !== '') {
            toEl.value = fromEl.value;
            return;
        }
        
        // If DOM element not found, try localStorage
        const savedValue = localStorage.getItem(`ipoteka_${from}`);
        if (savedValue !== null && savedValue !== '' && savedValue !== '0') {
            toEl.value = savedValue;
        }
    });
}

/**
 * Sync values from scenarios form to main form
 */
function syncFromScenariosForm() {
    const mappings = [
        { from: 'scenarioMortgageAmount', to: 'mortgageAmount' },
        { from: 'scenarioMortgageDown', to: 'mortgageDown' },
        { from: 'scenarioMortgageRate', to: 'mortgageRate' },
        { from: 'scenarioExtraPct', to: 'extraPct' },
        { from: 'scenarioMortgageCosts', to: 'mortgageCosts' },
        { from: 'scenarioMortgageGrowth', to: 'mortgageGrowth' },
        { from: 'scenarioInvestTax', to: 'investTax' },
        { from: 'scenarioDividends', to: 'dividends' },
        { from: 'scenarioRentBase', to: 'rentBase' },
        { from: 'scenarioUtilities', to: 'utilities' },
        { from: 'scenarioRentGrowth', to: 'rentGrowth' },
        { from: 'scenarioUtilitiesGrowth', to: 'utilitiesGrowth' }
    ];
    
    mappings.forEach(({ from, to }) => {
        const fromEl = document.getElementById(from);
        const toEl = document.getElementById(to);
        if (fromEl && toEl) {
            toEl.value = fromEl.value;
        }
    });
}

/**
 * Switch between comparison and scenarios tabs
 */
function switchTab(tab) {
    const scenariosSection = document.querySelector('#scenariosSection');
    const mainH1 = document.querySelector('body > h1');
    const mainTables = document.querySelectorAll('body > table');
    const mainH3s = document.querySelectorAll('body > h3');
    const chartContainer = document.querySelector('#chartContainer');
    const monthlyPayment = document.querySelector('#monthlyPayment');
    
    if (tab === 'comparison') {
        // Sync values from scenarios form to main form
        syncFromScenariosForm();
        
        // Update tab buttons
        const tabs = document.querySelectorAll('.tab');
        tabs[0].classList.add('active');
        if (tabs[1]) tabs[1].classList.remove('active');
        
        // Show main section elements
        if (mainH1) mainH1.style.display = 'block';
        mainH3s.forEach(h => h.style.display = 'block');
        mainTables.forEach(t => t.style.display = 'table');
        if (chartContainer) chartContainer.style.display = 'block';
        if (monthlyPayment) monthlyPayment.style.display = 'block';
        
        // Hide scenarios section
        if (scenariosSection) scenariosSection.style.display = 'none';
        
        // Recalculate main comparison
        recalc();
    } else if (tab === 'scenarios') {
        // Sync values from main form to scenarios form
        syncToScenariosForm();
        
        // Update tab buttons
        const tabs = document.querySelectorAll('.tab');
        tabs[0].classList.remove('active');
        if (tabs[1]) tabs[1].classList.add('active');
        
        // Hide main section elements
        if (mainH1) mainH1.style.display = 'none';
        mainH3s.forEach(h => {
            // Keep scenarios section h3s visible
            if (!h.closest('#scenariosSection')) {
                h.style.display = 'none';
            }
        });
        mainTables.forEach(t => {
            // Keep scenarios table visible
            if (t.id !== 'scenariosTable') {
                t.style.display = 'none';
            }
        });
        if (chartContainer) chartContainer.style.display = 'none';
        if (monthlyPayment) monthlyPayment.style.display = 'none';
        
        // Show scenarios section
        if (scenariosSection) scenariosSection.style.display = 'block';
    }
}

/**
 * Calculate scenarios with different parameters
 */
function calculateScenarios() {
    // Get base inputs from scenario section (or fallback to main form if not available)
    const getValue = (scenarioId, mainId) => {
        const scenarioEl = document.getElementById(scenarioId);
        const mainEl = document.getElementById(mainId);
        if (scenarioEl && scenarioEl.value.trim() && scenarioEl.value !== '0') {
            return +scenarioEl.value;
        }
        if (mainEl) return +mainEl.value;
        return 0;
    };
    
    const baseInputs = {
        mortgageAmount: getValue('scenarioMortgageAmount', 'mortgageAmount'),
        mortgageDown: getValue('scenarioMortgageDown', 'mortgageDown'),
        mortgageRate: getValue('scenarioMortgageRate', 'mortgageRate'),
        mortgageCosts: getValue('scenarioMortgageCosts', 'mortgageCosts'),
        mortgageGrowth: getValue('scenarioMortgageGrowth', 'mortgageGrowth'),
        investTax: getValue('scenarioInvestTax', 'investTax'),
        dividends: getValue('scenarioDividends', 'dividends'),
        rentBase: getValue('scenarioRentBase', 'rentBase'),
        utilities: getValue('scenarioUtilities', 'utilities'),
        rentGrowth: getValue('scenarioRentGrowth', 'rentGrowth'),
        utilitiesGrowth: getValue('scenarioUtilitiesGrowth', 'utilitiesGrowth')
    };

    // Get scenario ranges with null checks
    const getRangeValue = (id, defaultValue = 0) => {
        const el = document.getElementById(id);
        return el ? +el.value : defaultValue;
    };
    
    const ranges = {
        mortgageYears: {
            from: getRangeValue('scenarioMortgageYearsFrom', 20),
            to: getRangeValue('scenarioMortgageYearsTo', 30),
            step: getRangeValue('scenarioMortgageYearsStep', 5)
        },
        investRate: {
            from: getRangeValue('scenarioInvestRateFrom', 5),
            to: getRangeValue('scenarioInvestRateTo', 10),
            step: getRangeValue('scenarioInvestRateStep', 1)
        },
        extraAmount: {
            from: getRangeValue('scenarioExtraAmountFrom', 5000),
            to: getRangeValue('scenarioExtraAmountTo', 10000),
            step: getRangeValue('scenarioExtraAmountStep', 2500)
        },
        extraPct: {
            from: getRangeValue('scenarioExtraPctFrom', 30),
            to: getRangeValue('scenarioExtraPctTo', 70),
            step: getRangeValue('scenarioExtraPctStep', 5)
        },
        solvency: {
            from: getRangeValue('scenarioSolvencyFrom', 10),
            to: getRangeValue('scenarioSolvencyTo', 20),
            step: getRangeValue('scenarioSolvencyStep', 5)
        }
    };

    // Generate all combinations
    const scenarios = [];
    const mortgageYearsValues = generateRange(ranges.mortgageYears.from, ranges.mortgageYears.to, ranges.mortgageYears.step);
    const investRateValues = generateRange(ranges.investRate.from, ranges.investRate.to, ranges.investRate.step);
    const extraAmountValues = generateRange(ranges.extraAmount.from, ranges.extraAmount.to, ranges.extraAmount.step);
    const extraPctValues = generateRange(ranges.extraPct.from, ranges.extraPct.to, ranges.extraPct.step);
    const solvencyValues = generateRange(ranges.solvency.from, ranges.solvency.to, ranges.solvency.step);

    // Calculate all scenarios
    for (const mortgageYears of mortgageYearsValues) {
        for (const investRate of investRateValues) {
            for (const extraAmount of extraAmountValues) {
                for (const extraPct of extraPctValues) {
                    for (const solvency of solvencyValues) {
                        // Limit solvency to mortgageYears (max)
                        const effectiveSolvency = Math.min(solvency, mortgageYears);
                        
                        const scenario = calculateSingleScenario({
                            ...baseInputs,
                            mortgageYears,
                            investRate,
                            extraAmount,
                            extraPct,
                            solvency: effectiveSolvency
                        });
                        scenarios.push({
                            mortgageYears,
                            investRate,
                            extraAmount,
                            extraPct,
                            solvency: effectiveSolvency,
                            ...scenario
                        });
                    }
                }
            }
        }
    }

    // Store scenarios for chart
    window.scenariosData = scenarios;

    // Display results
    displayScenariosTable(scenarios);
    updateScenariosChart(scenarios, 'mortgageYears');
}

/**
 * Generate range of values
 */
function generateRange(from, to, step) {
    const values = [];
    for (let v = from; v <= to; v += step) {
        values.push(v);
    }
    return values;
}

/**
 * Calculate single scenario
 */
function calculateSingleScenario(inputs) {
    const loan = inputs.mortgageAmount * (1 - inputs.mortgageDown / 100);
    const monthlyRate = inputs.mortgageRate / 12 / 100;
    const monthsTotal = inputs.mortgageYears * 12;
    const maxMonths = inputs.solvency * 12;
    const stepMonths = Math.min(monthsTotal, maxMonths);

    const basePayment = annuityPayment(loan, monthlyRate, monthsTotal);
    const rentMonthly = inputs.rentBase + inputs.utilities;
    const totalExtra = inputs.extraAmount > 0 ? inputs.extraAmount : rentMonthly;
    
    const extra1 = totalExtra;
    const extraAmountForOption2 = inputs.extraAmount;
    const extra2 = extraAmountForOption2 * (inputs.extraPct / 100);
    const investExtra2 = extraAmountForOption2 * (1 - inputs.extraPct / 100);

    // Calculate mortgage schedules
    let fullPayment = mortgageSchedule(loan, monthlyRate, basePayment, extra1, monthsTotal * 2);
    let partialPayment = mortgageSchedule(loan, monthlyRate, basePayment, extra2, monthsTotal * 2);

    if (fullPayment.monthsUsed > maxMonths) fullPayment = null;
    if (partialPayment.monthsUsed > maxMonths) partialPayment = null;

    // Scenario 1
    let invest1 = [];
    let expenses1 = 0;
    let houseValue1 = 0;
    let total1 = null;
    
    if (fullPayment) {
        const mortgageMonths = Math.min(fullPayment.monthsUsed, maxMonths);
        const period1 = maxMonths;
        
        for (let i = 0; i < mortgageMonths; i++) {
            invest1.push(0);
        }
        
        const investMonthly = basePayment + totalExtra;
        const monthsAfter = period1 - mortgageMonths;
        
        if (monthsAfter > 0) {
            invest1 = invest1.concat(
                investSchedule(investMonthly, inputs.investRate, inputs.investTax, monthsAfter, inputs.dividends)
            );
        }
        
        const monthsPaid = Math.min(fullPayment.monthsUsed, maxMonths);
        expenses1 = (basePayment + extra1) * monthsPaid + inputs.mortgageCosts;
        houseValue1 = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts) *
            Math.pow(1 + inputs.mortgageGrowth / 100, period1 / 12);
        total1 = invest1[invest1.length - 1] + houseValue1;
    }

    // Scenario 2
    let invest2 = [];
    let expenses2 = 0;
    let houseValue2 = 0;
    let total2 = null;
    
    if (partialPayment) {
        const mortgageMonths = Math.min(partialPayment.monthsUsed, maxMonths);
        const period2 = maxMonths;
        
        const investDuring = investSchedule(
            investExtra2, 
            inputs.investRate, 
            inputs.investTax, 
            mortgageMonths, 
            inputs.dividends
        );
        
        const investBalanceAtEnd = investDuring[investDuring.length - 1];
        const totalInvestedDuring = investExtra2 * mortgageMonths;
        
        const investMonthly = basePayment + totalExtra;
        const monthsAfter = period2 - mortgageMonths;
        
        const monthlyRate = inputs.investRate / 12 / 100;
        invest2 = investDuring.slice();
        
        let currentBalance = investBalanceAtEnd;
        for (let i = 0; i < monthsAfter; i++) {
            currentBalance = currentBalance * (1 + monthlyRate) + investMonthly;
            invest2.push(currentBalance);
        }
        
        if (inputs.investTax > 0 && invest2[invest2.length - 1] > 0) {
            const totalInvested = totalInvestedDuring + investMonthly * monthsAfter;
            const profit = invest2[invest2.length - 1] - totalInvested;
            
            if (profit > 0) {
                const tax = profit * (inputs.investTax / 100);
                invest2[invest2.length - 1] = invest2[invest2.length - 1] - tax;
            }
        }
        
        expenses2 = (basePayment + extra2) * mortgageMonths + inputs.mortgageCosts;
        houseValue2 = (inputs.mortgageAmount * (1 - inputs.mortgageDown / 100) + inputs.mortgageCosts) *
            Math.pow(1 + inputs.mortgageGrowth / 100, period2 / 12);
        total2 = invest2[invest2.length - 1] + houseValue2;
    }

    // Scenario 3: Rent + investment
    // For investment, use potential mandatory mortgage payment amount
    // Expenses (rent) are subtracted from final total, not from monthly investment
    const rent = rentSchedule(
        inputs.rentBase, 
        inputs.utilities, 
        inputs.rentGrowth, 
        inputs.utilitiesGrowth, 
        stepMonths
    );
    const invest3 = investSchedule(
        basePayment, 
        inputs.investRate, 
        inputs.investTax, 
        stepMonths, 
        inputs.dividends
    );
    const expenses3 = rent.reduce((a, b) => a + b, 0);
    // "Net worth" = investments minus rent expenses (expenses are just a loss, not an asset)
    const total3 = invest3[invest3.length - 1] - expenses3;

    return {
        total1,
        total2,
        total3,
        expenses1,
        expenses2,
        expenses3,
        invest1: invest1.length > 0 ? invest1[invest1.length - 1] : 0,
        invest2: invest2.length > 0 ? invest2[invest2.length - 1] : 0,
        invest3: invest3[invest3.length - 1],
        houseValue1,
        houseValue2
    };
}

/**
 * Display scenarios in table showing winning percentages for each parameter value
 */
function displayScenariosTable(scenarios) {
    const tbody = document.querySelector('#scenariosTable tbody');
    const thead = document.querySelector('#scenariosTable thead');
    
    // Calculate overall winning percentages
    const overallPcts = calculateOverallWinningPercentages(scenarios);
    
    // Calculate winning percentages for each parameter
    const parameters = [
        { key: 'mortgageYears', label: 'Термін іпотеки (роки)', format: (v) => `${v} р.` },
        { key: 'investRate', label: 'Дохідність інвестицій (%)', format: (v) => `${v}%` },
        { key: 'extraAmount', label: 'Переплата (PLN/міс)', format: (v) => formatPLN(v) },
        { key: 'extraPct', label: 'Переплата X% (варіант 2)', format: (v) => `${v}%` },
        { key: 'solvency', label: 'Платоспроможність (роки)', format: (v) => `${v} р.` }
    ];

    // Build table with all parameter values
    let allRows = [];
    
    // Add overall summary row
    allRows.push({
        type: 'summary',
        label: 'Загальний відсоток виграшів',
        pct1: overallPcts[1],
        pct2: overallPcts[2],
        pct3: overallPcts[3]
    });
    
    parameters.forEach(param => {
        const percentagesByValue = calculateWinningPercentagesByValue(scenarios, param.key);
        
        // Add header row for parameter
        allRows.push({
            type: 'header',
            label: param.label
        });
        
        // Add rows for each value
        Object.keys(percentagesByValue).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(value => {
            const pcts = percentagesByValue[value];
            allRows.push({
                type: 'data',
                paramValue: param.format(parseFloat(value)),
                pct1: pcts[1],
                pct2: pcts[2],
                pct3: pcts[3]
            });
        });
    });

    // Build table header
    thead.innerHTML = `
        <tr>
            <th>Параметр / Значення</th>
            <th>Варіант 1 виграє (%)</th>
            <th>Варіант 2 виграє (%)</th>
            <th>Варіант 3 виграє (%)</th>
        </tr>
    `;

    // Build table body
    tbody.innerHTML = allRows.map(row => {
        if (row.type === 'summary') {
            const getCellClass = (pct) => {
                if (pct === null) return '';
                if (pct >= 50) return 'best';
                return '';
            };
            
            const getCellStyle = (pct) => {
                if (pct === null) return 'text-align: center;';
                const intensity = Math.min(pct / 100, 1);
                const bgColor = `rgba(42, 127, 98, ${intensity * 0.3})`;
                return `text-align: center; background-color: ${bgColor}; font-weight: bold; font-size: 1.1em;`;
            };
            
            return `
                <tr style="background-color: #e8f5e9; border-top: 3px solid #2a7f62; border-bottom: 3px solid #2a7f62;">
                    <td style="font-weight: bold; text-align: left; padding: 12px;">${row.label}</td>
                    <td class="${getCellClass(row.pct1)}" style="${getCellStyle(row.pct1)}">${row.pct1 !== null ? `${row.pct1.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                    <td class="${getCellClass(row.pct2)}" style="${getCellStyle(row.pct2)}">${row.pct2 !== null ? `${row.pct2.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                    <td class="${getCellClass(row.pct3)}" style="${getCellStyle(row.pct3)}">${row.pct3 !== null ? `${row.pct3.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                </tr>
            `;
        } else if (row.type === 'header') {
            return `
                <tr style="background-color: #f0f0f0;">
                    <td colspan="4" style="font-weight: bold; text-align: left; padding: 10px;">${row.label}</td>
                </tr>
            `;
        } else {
            const getCellClass = (pct) => {
                if (pct === null) return '';
                if (pct >= 50) return 'best';
                return '';
            };
            
            const getCellStyle = (pct) => {
                if (pct === null) return 'text-align: center;';
                const intensity = Math.min(pct / 100, 1);
                const bgColor = `rgba(42, 127, 98, ${intensity * 0.2})`;
                return `text-align: center; background-color: ${bgColor}; font-weight: ${pct >= 50 ? 'bold' : 'normal'};`;
            };
            
            return `
                <tr>
                    <td style="text-align: left; padding-left: 30px;">${row.paramValue}</td>
                    <td class="${getCellClass(row.pct1)}" style="${getCellStyle(row.pct1)}">${row.pct1 !== null ? `${row.pct1.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                    <td class="${getCellClass(row.pct2)}" style="${getCellStyle(row.pct2)}">${row.pct2 !== null ? `${row.pct2.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                    <td class="${getCellClass(row.pct3)}" style="${getCellStyle(row.pct3)}">${row.pct3 !== null ? `${row.pct3.toFixed(1)}%` : '<span class="na">—</span>'}</td>
                </tr>
            `;
        }
    }).join('');

    document.getElementById('scenariosResults').style.display = 'block';
}

/**
 * Calculate overall winning percentages across all scenarios
 * Returns object with variant numbers as keys and percentages as values
 */
function calculateOverallWinningPercentages(scenarios) {
    const wins = { 1: 0, 2: 0, 3: 0 };
    let totalScenarios = scenarios.length;
    
    scenarios.forEach(s => {
        // Count wins (when variant has highest total among all possible variants)
        const allTotals = [s.total1, s.total2, s.total3].filter(v => v !== null);
        if (allTotals.length > 0) {
            const maxTotal = Math.max(...allTotals);
            if (s.total1 === maxTotal) wins[1]++;
            if (s.total2 === maxTotal) wins[2]++;
            if (s.total3 === maxTotal) wins[3]++;
        }
    });

    // Calculate percentages: wins / total scenarios * 100
    return {
        1: totalScenarios > 0 ? (wins[1] / totalScenarios) * 100 : null,
        2: totalScenarios > 0 ? (wins[2] / totalScenarios) * 100 : null,
        3: totalScenarios > 0 ? (wins[3] / totalScenarios) * 100 : null
    };
}

/**
 * Calculate overall winning percentages for a specific parameter (weighted average across all its values)
 * Returns object with variant numbers as keys and percentages as values
 * This calculates the weighted average percentage of wins, weighted by number of scenarios for each value
 */
function calculateParameterOverallPercentages(scenarios, paramKey) {
    // Group scenarios by parameter value
    const grouped = {};
    scenarios.forEach(s => {
        const value = s[paramKey];
        if (!grouped[value]) {
            grouped[value] = [];
        }
        grouped[value].push(s);
    });

    // Calculate weighted average: sum of (wins for value) / total scenarios
    let totalWins = { 1: 0, 2: 0, 3: 0 };
    let totalScenarios = 0;
    
    Object.keys(grouped).forEach(value => {
        const valueScenarios = grouped[value];
        const wins = { 1: 0, 2: 0, 3: 0 };
        
        valueScenarios.forEach(s => {
            totalScenarios++;
            // Count wins (when variant has highest total among all possible variants)
            const allTotals = [s.total1, s.total2, s.total3].filter(v => v !== null);
            if (allTotals.length > 0) {
                const maxTotal = Math.max(...allTotals);
                if (s.total1 === maxTotal) totalWins[1]++;
                if (s.total2 === maxTotal) totalWins[2]++;
                if (s.total3 === maxTotal) totalWins[3]++;
            }
        });
    });

    // Calculate percentages: total wins / total scenarios * 100
    return {
        1: totalScenarios > 0 ? (totalWins[1] / totalScenarios) * 100 : null,
        2: totalScenarios > 0 ? (totalWins[2] / totalScenarios) * 100 : null,
        3: totalScenarios > 0 ? (totalWins[3] / totalScenarios) * 100 : null
    };
}

/**
 * Calculate winning percentages for each value of a specific parameter
 * Returns object with parameter values as keys and percentages objects as values
 */
function calculateWinningPercentagesByValue(scenarios, paramKey) {
    // Group scenarios by parameter value
    const grouped = {};
    scenarios.forEach(s => {
        const value = s[paramKey];
        if (!grouped[value]) {
            grouped[value] = [];
        }
        grouped[value].push(s);
    });

    // For each parameter value, calculate percentages
    const result = {};
    
    Object.keys(grouped).forEach(value => {
        const valueScenarios = grouped[value];
        const wins = { 1: 0, 2: 0, 3: 0 };
        let totalScenarios = 0;
        
        valueScenarios.forEach(s => {
            totalScenarios++;
            
            // Count wins (when variant has highest total among all possible variants)
            const allTotals = [s.total1, s.total2, s.total3].filter(v => v !== null);
            if (allTotals.length > 0) {
                const maxTotal = Math.max(...allTotals);
                if (s.total1 === maxTotal) wins[1]++;
                if (s.total2 === maxTotal) wins[2]++;
                if (s.total3 === maxTotal) wins[3]++;
            }
        });

        // Calculate percentages: wins / total scenarios * 100
        result[value] = {
            1: totalScenarios > 0 ? (wins[1] / totalScenarios) * 100 : null,
            2: totalScenarios > 0 ? (wins[2] / totalScenarios) * 100 : null,
            3: totalScenarios > 0 ? (wins[3] / totalScenarios) * 100 : null
        };
    });

    return result;
}

/**
 * Calculate winning ranges for a specific parameter (deprecated, kept for compatibility)
 * Returns object with variant numbers as keys and arrays of ranges as values
 */
function calculateWinningRanges(scenarios, paramKey) {
    // Group scenarios by parameter value
    const grouped = {};
    scenarios.forEach(s => {
        const value = s[paramKey];
        if (!grouped[value]) {
            grouped[value] = [];
        }
        grouped[value].push(s);
    });

    // For each parameter value, determine which variant wins most often
    // Count wins only when variant is possible (not null)
    const valueWinners = {};
    Object.keys(grouped).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(value => {
        const valueScenarios = grouped[value];
        const wins = { 1: 0, 2: 0, 3: 0 };
        const possible = { 1: 0, 2: 0, 3: 0 };
        
        valueScenarios.forEach(s => {
            // Count how many times each variant is possible
            if (s.total1 !== null) possible[1]++;
            if (s.total2 !== null) possible[2]++;
            if (s.total3 !== null) possible[3]++;
            
            // Count wins (when variant has highest total among all possible variants)
            const allTotals = [s.total1, s.total2, s.total3].filter(v => v !== null);
            if (allTotals.length > 0) {
                const maxTotal = Math.max(...allTotals);
                if (s.total1 === maxTotal) wins[1]++;
                if (s.total2 === maxTotal) wins[2]++;
                if (s.total3 === maxTotal) wins[3]++;
            }
        });
        
        // Determine winner: variant with most wins
        // Only consider variants that are possible in at least one case
        const maxWins = Math.max(wins[1], wins[2], wins[3]);
        
        if (maxWins > 0) {
            // Simple logic: variant with most wins wins
            // In case of tie, prefer variant 1, then 2, then 3
            if (wins[1] === maxWins && possible[1] > 0) {
                valueWinners[value] = 1;
            } else if (wins[2] === maxWins && possible[2] > 0) {
                valueWinners[value] = 2;
            } else if (wins[3] === maxWins && possible[3] > 0) {
                valueWinners[value] = 3;
            }
        }
    });

    // Find continuous ranges for each variant
    // Track all variants that win (not just primary winner)
    const ranges = { 1: [], 2: [], 3: [] };
    const allWinners = {}; // value -> array of variants that win
    
    // Find all variants that win for each value
    Object.keys(grouped).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(value => {
        const valueScenarios = grouped[value];
        const wins = { 1: 0, 2: 0, 3: 0 };
        const possible = { 1: 0, 2: 0, 3: 0 };
        
        valueScenarios.forEach(s => {
            if (s.total1 !== null) possible[1]++;
            if (s.total2 !== null) possible[2]++;
            if (s.total3 !== null) possible[3]++;
            
            const allTotals = [s.total1, s.total2, s.total3].filter(v => v !== null);
            if (allTotals.length > 0) {
                const maxTotal = Math.max(...allTotals);
                if (s.total1 === maxTotal) wins[1]++;
                if (s.total2 === maxTotal) wins[2]++;
                if (s.total3 === maxTotal) wins[3]++;
            }
        });
        
        // Track all variants that win in at least one case
        allWinners[value] = [];
        if (wins[1] > 0 && possible[1] > 0) allWinners[value].push(1);
        if (wins[2] > 0 && possible[2] > 0) allWinners[value].push(2);
        if (wins[3] > 0 && possible[3] > 0) allWinners[value].push(3);
    });
    
    // Build ranges for each variant
    [1, 2, 3].forEach(variant => {
        const variantValues = [];
        Object.keys(allWinners).forEach(value => {
            if (allWinners[value].includes(variant)) {
                variantValues.push(parseFloat(value));
            }
        });
        
        if (variantValues.length === 0) return;
        
        variantValues.sort((a, b) => a - b);
        let rangeStart = variantValues[0];
        let rangeEnd = variantValues[0];
        
        for (let i = 1; i < variantValues.length; i++) {
            // Check if values are continuous (within step tolerance)
            const step = variantValues[i] - variantValues[i - 1];
            const avgStep = (variantValues[variantValues.length - 1] - variantValues[0]) / Math.max(1, variantValues.length - 1);
            const tolerance = Math.max(avgStep * 1.5, 0.1);
            
            if (variantValues[i] - rangeEnd <= tolerance) {
                rangeEnd = variantValues[i];
            } else {
                ranges[variant].push([rangeStart, rangeEnd]);
                rangeStart = variantValues[i];
                rangeEnd = variantValues[i];
            }
        }
        ranges[variant].push([rangeStart, rangeEnd]);
    });

    return ranges;
}

/**
 * Format ranges array into readable string
 */
function formatRanges(ranges, formatFn) {
    if (!ranges || ranges.length === 0) return null;
    
    return ranges.map(range => {
        if (range[0] === range[1]) {
            return formatFn(range[0]);
        } else {
            return `${formatFn(range[0])} - ${formatFn(range[1])}`;
        }
    }).join(', ');
}

/**
 * Filter to show only best scenarios for each parameter combination
 */
function filterBestScenarios(scenarios) {
    const bestMap = new Map();
    
    scenarios.forEach(s => {
        const key = `${s.mortgageYears}_${s.investRate}_${s.extraAmount}_${s.extraPct}_${s.solvency}`;
        const maxTotal = Math.max(
            s.total1 || -Infinity,
            s.total2 || -Infinity,
            s.total3 || -Infinity
        );
        
        if (!bestMap.has(key) || bestMap.get(key).maxTotal < maxTotal) {
            bestMap.set(key, { scenario: s, maxTotal });
        }
    });
    
    return Array.from(bestMap.values()).map(v => v.scenario);
}

/**
 * Update scenarios chart
 */
function updateScenariosChart(scenarios, parameter) {
    const chartContainer = document.getElementById('scenariosChartContainer');
    const chartCanvas = document.getElementById('scenariosChart');
    
    // Group scenarios by parameter value
    const grouped = {};
    scenarios.forEach(s => {
        const value = s[parameter];
        if (!grouped[value]) {
            grouped[value] = [];
        }
        grouped[value].push(s);
    });
    
    // Calculate average for each parameter value
    const labels = Object.keys(grouped).sort((a, b) => +a - +b);
    const data1 = [];
    const data2 = [];
    const data3 = [];
    
    labels.forEach(value => {
        const group = grouped[value];
        const avg1 = group.reduce((sum, s) => sum + (s.total1 || 0), 0) / group.length;
        const avg2 = group.reduce((sum, s) => sum + (s.total2 || 0), 0) / group.length;
        const avg3 = group.reduce((sum, s) => sum + (s.total3 || 0), 0) / group.length;
        
        data1.push(avg1);
        data2.push(avg2);
        data3.push(avg3);
    });
    
    const paramLabels = {
        mortgageYears: 'Термін іпотеки (роки)',
        investRate: 'Дохідність інвестицій (%)',
        extraAmount: 'Переплата (PLN/міс)',
        extraPct: 'Переплата X% (варіант 2)',
        solvency: 'Платоспроможність (роки)'
    };
    
    if (scenariosChart) scenariosChart.destroy();
    const ctx = chartCanvas.getContext('2d');
    scenariosChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Варіант 1: Повна переплата → інвестиції',
                    data: data1,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    fill: false
                },
                {
                    label: 'Варіант 2: Переплата + паралельне інвестування',
                    data: data2,
                    borderColor: 'orange',
                    backgroundColor: 'rgba(255, 165, 0, 0.1)',
                    fill: false
                },
                {
                    label: 'Варіант 3: Оренда + інвестиції',
                    data: data3,
                    borderColor: 'green',
                    backgroundColor: 'rgba(0, 128, 0, 0.1)',
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: `Залежність прибутку від ${paramLabels[parameter]}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Середній прибуток (PLN)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('uk-UA') + ' PLN';
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: paramLabels[parameter],
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Toggle collapsible section
 */
function toggleCollapsible(id) {
    const element = document.getElementById(id);
    const toggle = document.getElementById(id + 'Toggle');
    if (element && toggle) {
        if (element.style.display === 'none') {
            element.style.display = 'block';
            toggle.textContent = '▼';
        } else {
            element.style.display = 'none';
            toggle.textContent = '▶';
        }
    }
}

/**
 * Save scenario inputs to localStorage
 */
function saveScenariosToLocalStorage() {
    const baseInputs = [
        'scenarioMortgageAmount', 'scenarioMortgageDown', 'scenarioMortgageRate',
        'scenarioMortgageCosts', 'scenarioMortgageGrowth', 'scenarioInvestTax',
        'scenarioDividends', 'scenarioRentBase', 'scenarioUtilities',
        'scenarioRentGrowth', 'scenarioUtilitiesGrowth'
    ];
    
    const rangeInputs = [
        'scenarioMortgageYearsFrom', 'scenarioMortgageYearsTo', 'scenarioMortgageYearsStep',
        'scenarioInvestRateFrom', 'scenarioInvestRateTo', 'scenarioInvestRateStep',
        'scenarioExtraAmountFrom', 'scenarioExtraAmountTo', 'scenarioExtraAmountStep',
        'scenarioExtraPctFrom', 'scenarioExtraPctTo', 'scenarioExtraPctStep',
        'scenarioSolvencyFrom', 'scenarioSolvencyTo', 'scenarioSolvencyStep'
    ];
    
    [...baseInputs, ...rangeInputs].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            localStorage.setItem(`scenarios_${id}`, element.value);
        }
    });
}

/**
 * Load scenario inputs from localStorage
 * Also loads from main form localStorage if scenario data not found
 * Sets default values from main page if no data in localStorage
 * @returns {boolean} true if any data was found in localStorage
 */
function loadScenariosFromLocalStorage() {
    // Default values from main page (index.html)
    const defaults = {
        mortgageAmount: '1800000',
        mortgageDown: '25',
        mortgageRate: '5.71',
        mortgageCosts: '50000',
        mortgageGrowth: '2',
        investTax: '19',
        dividends: '1',
        rentBase: '6000',
        utilities: '1500',
        rentGrowth: '3',
        utilitiesGrowth: '2'
    };
    
    const baseInputs = [
        { scenario: 'scenarioMortgageAmount', main: 'mortgageAmount' },
        { scenario: 'scenarioMortgageDown', main: 'mortgageDown' },
        { scenario: 'scenarioMortgageRate', main: 'mortgageRate' },
        { scenario: 'scenarioMortgageCosts', main: 'mortgageCosts' },
        { scenario: 'scenarioMortgageGrowth', main: 'mortgageGrowth' },
        { scenario: 'scenarioInvestTax', main: 'investTax' },
        { scenario: 'scenarioDividends', main: 'dividends' },
        { scenario: 'scenarioRentBase', main: 'rentBase' },
        { scenario: 'scenarioUtilities', main: 'utilities' },
        { scenario: 'scenarioRentGrowth', main: 'rentGrowth' },
        { scenario: 'scenarioUtilitiesGrowth', main: 'utilitiesGrowth' }
    ];
    
    const rangeInputs = [
        'scenarioMortgageYearsFrom', 'scenarioMortgageYearsTo', 'scenarioMortgageYearsStep',
        'scenarioInvestRateFrom', 'scenarioInvestRateTo', 'scenarioInvestRateStep',
        'scenarioExtraAmountFrom', 'scenarioExtraAmountTo', 'scenarioExtraAmountStep',
        'scenarioExtraPctFrom', 'scenarioExtraPctTo', 'scenarioExtraPctStep',
        'scenarioSolvencyFrom', 'scenarioSolvencyTo', 'scenarioSolvencyStep'
    ];
    
    let foundAny = false;
    
    // Load base inputs - try scenarios localStorage first, then main form localStorage, then defaults
    baseInputs.forEach(({ scenario, main }) => {
        const element = document.getElementById(scenario);
        if (element) {
            // First try scenarios localStorage
            let savedValue = localStorage.getItem(`scenarios_${scenario}`);
            
            // If not found, try main form localStorage
            if (savedValue === null) {
                savedValue = localStorage.getItem(`ipoteka_${main}`);
            }
            
            // If still not found, use default value
            if (savedValue === null || savedValue === '') {
                savedValue = defaults[main] || null;
            }
            
            if (savedValue !== null && savedValue !== '') {
                element.value = savedValue;
                foundAny = true;
            }
        }
    });
    
    // Load range inputs - only from scenarios localStorage (keep existing defaults from HTML)
    rangeInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const savedValue = localStorage.getItem(`scenarios_${id}`);
            if (savedValue !== null) {
                element.value = savedValue;
                foundAny = true;
            }
        }
    });
    
    return foundAny;
}

// Initialize scenarios functionality
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on scenarios page
    const isScenariosPage = document.getElementById('scenariosSection') || window.location.pathname.includes('scenarios.html');
    
    if (isScenariosPage) {
        // Load saved scenario data from localStorage
        // This function now also tries to load from main form localStorage if scenario data not found
        loadScenariosFromLocalStorage();
        
        // Also sync from main form DOM for any remaining empty fields (if on same page)
        setTimeout(() => {
            syncToScenariosForm();
        }, 100);
    }
    
    // Attach event listeners to save data on input
    const scenarioInputs = document.querySelectorAll('input[id^="scenario"]');
    scenarioInputs.forEach(input => {
        input.addEventListener('input', () => {
            saveScenariosToLocalStorage();
        });
    });
    
    const calculateBtn = document.getElementById('calculateScenarios');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateScenarios);
    }
    
    const showOnlyBestCheckbox = document.getElementById('showOnlyBest');
    if (showOnlyBestCheckbox) {
        showOnlyBestCheckbox.addEventListener('change', () => {
            if (window.scenariosData) {
                displayScenariosTable(window.scenariosData);
            }
        });
    }
    
    const chartParameterSelect = document.getElementById('chartParameter');
    if (chartParameterSelect) {
        chartParameterSelect.addEventListener('change', (e) => {
            if (window.scenariosData) {
                updateScenariosChart(window.scenariosData, e.target.value);
            }
        });
    }
    
    // Add event listeners for solvency limits
    const mortgageYearsFrom = document.getElementById('scenarioMortgageYearsFrom');
    const mortgageYearsTo = document.getElementById('scenarioMortgageYearsTo');
    const solvencyFrom = document.getElementById('scenarioSolvencyFrom');
    const solvencyTo = document.getElementById('scenarioSolvencyTo');
    
    function updateSolvencyLimits() {
        if (mortgageYearsTo && solvencyTo) {
            const maxMortgageYears = +mortgageYearsTo.value;
            const currentSolvencyTo = +solvencyTo.value;
            if (currentSolvencyTo > maxMortgageYears) {
                solvencyTo.value = maxMortgageYears;
            }
        }
        if (mortgageYearsFrom && solvencyFrom) {
            const minMortgageYears = +mortgageYearsFrom.value;
            const currentSolvencyFrom = +solvencyFrom.value;
            if (currentSolvencyFrom > minMortgageYears) {
                solvencyFrom.value = minMortgageYears;
            }
        }
    }
    
    if (mortgageYearsTo) {
        mortgageYearsTo.addEventListener('input', updateSolvencyLimits);
    }
    if (mortgageYearsFrom) {
        mortgageYearsFrom.addEventListener('input', updateSolvencyLimits);
    }
    if (solvencyTo) {
        solvencyTo.addEventListener('input', () => {
            if (mortgageYearsTo) {
                const maxMortgageYears = +mortgageYearsTo.value;
                const currentSolvencyTo = +solvencyTo.value;
                if (currentSolvencyTo > maxMortgageYears) {
                    solvencyTo.value = maxMortgageYears;
                }
            }
        });
    }
    if (solvencyFrom) {
        solvencyFrom.addEventListener('input', () => {
            if (mortgageYearsFrom) {
                const minMortgageYears = +mortgageYearsFrom.value;
                const currentSolvencyFrom = +solvencyFrom.value;
                if (currentSolvencyFrom > minMortgageYears) {
                    solvencyFrom.value = minMortgageYears;
                }
            }
        });
    }
});
