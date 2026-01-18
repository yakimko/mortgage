/**
 * Mortgage calculator logic
 * Calculates maximum possible mortgage amount based on payment capacity
 */

let chart;

/**
 * Main calculation function
 * Calculates maximum mortgage amount based on available payment and solvency period
 */
function recalcMortgage() {
    // Read input values (try both possible IDs for compatibility)
    const solvencyEl = document.getElementById('mortgageCalcSolvency') || document.getElementById('solvency');
    const monthlyPaymentEl = document.getElementById('mortgageCalcMonthlyPayment') || document.getElementById('monthlyPayment');
    
    const inputs = {
        mortgageRate: +document.getElementById('mortgageRate').value,
        mortgageYears: +document.getElementById('mortgageYears').value,
        mortgageDown: +document.getElementById('mortgageDown').value,
        solvency: +(solvencyEl ? solvencyEl.value : 15),
        monthlyPayment: +(monthlyPaymentEl ? monthlyPaymentEl.value : 15000),
        lumpSumPaymentMonthly: +document.getElementById('lumpSumPaymentMonthly').value
    };

    // Validate inputs
    if (inputs.monthlyPayment <= 0) {
        document.querySelector('#result tbody').innerHTML = `
            <tr>
                <td>Помилка</td>
                <td class="na">Доступна сума для щомісячного платежу повинна бути більше 0</td>
            </tr>
        `;
        return;
    }

    if (inputs.lumpSumPaymentMonthly < 0) {
        document.querySelector('#result tbody').innerHTML = `
            <tr>
                <td>Помилка</td>
                <td class="na">Сума для переплати не може бути від'ємною</td>
            </tr>
        `;
        return;
    }

    if (inputs.solvency <= 0) {
        document.querySelector('#result tbody').innerHTML = `
            <tr>
                <td>Помилка</td>
                <td class="na">Срок платежеспособності повинен бути більше 0</td>
            </tr>
        `;
        return;
    }

    if (inputs.mortgageDown < 0) {
        document.querySelector('#result tbody').innerHTML = `
            <tr>
                <td>Помилка</td>
                <td class="na">Перший внесок не може бути від'ємним</td>
            </tr>
        `;
        return;
    }

    // Calculate parameters
    const monthlyRate = inputs.mortgageRate / 12 / 100;
    const monthsTotal = inputs.mortgageYears * 12;
    const maxMonths = inputs.solvency * 12;
    
    // Use minimum of mortgage term and solvency period
    const effectiveMonths = Math.min(monthsTotal, maxMonths);

    // Use direct values from inputs
    const monthlyPayment = inputs.monthlyPayment;
    // Total overpayment will be calculated based on actual months used
    let lumpSumPayment = 0;

    // Step 1: Calculate maximum mortgage amount based on monthly payment
    // Use the full mortgage term for calculation (e.g., 10 years)
    // Then check if it can be repaid within solvency period (e.g., 9 years)
    const maxLoan = maxLoanFromPayment(monthlyPayment, monthlyRate, monthsTotal);
    const maxMortgageAmount = maxLoan + inputs.mortgageDown;
    const requiredDownPayment = inputs.mortgageDown;
    const actualLoan = maxMortgageAmount - inputs.mortgageDown;

    // Step 2: Calculate repayment schedule
    // First, calculate how long it would take to repay without overpayment
    let scheduleWithoutOverpayment = mortgageSchedule(actualLoan, monthlyRate, monthlyPayment, 0, monthsTotal * 2);
    const monthsToRepayWithoutOverpayment = scheduleWithoutOverpayment.monthsUsed;
    
    let actualLoanAfterLumpSum = actualLoan;
    let actualPayment = monthlyPayment;
    let schedule = { balances: [actualLoan], monthsUsed: monthsTotal, totalPaid: 0 };
    let actualMonthsUsed = monthsTotal;
    let totalPaid = 0;
    let cannotRepayInTime = false;
    
    if (inputs.lumpSumPaymentMonthly > 0) {
        // Calculate repayment schedule with monthly overpayment applied each month
        // The overpayment reduces principal each month, shortening the term
        // Calculate with full term first to see actual repayment time
        schedule = mortgageSchedule(actualLoan, monthlyRate, monthlyPayment, inputs.lumpSumPaymentMonthly, monthsTotal * 2);
        actualMonthsUsed = schedule.monthsUsed;
        totalPaid = schedule.totalPaid;
        
        // Check if loan can be repaid within solvency period
        if (actualMonthsUsed > maxMonths) {
            cannotRepayInTime = true;
            // Get the balance at the end of solvency period
            const scheduleLimited = mortgageSchedule(actualLoan, monthlyRate, monthlyPayment, inputs.lumpSumPaymentMonthly, maxMonths);
            actualLoanAfterLumpSum = scheduleLimited.balances.length > 0 ? scheduleLimited.balances[scheduleLimited.balances.length - 1] : 0;
            // Recalculate total paid for solvency period only
            totalPaid = scheduleLimited.totalPaid;
        } else {
            actualLoanAfterLumpSum = schedule.balances.length > 0 ? schedule.balances[schedule.balances.length - 1] : 0;
        }
        
        // Calculate total overpayment amount (only for months actually used, up to solvency period if limited)
        const monthsForOverpayment = cannotRepayInTime ? maxMonths : actualMonthsUsed;
        const totalOverpayment = inputs.lumpSumPaymentMonthly * monthsForOverpayment;
        
        // Update lumpSumPayment for display (total overpayment actually made)
        lumpSumPayment = totalOverpayment;
    } else {
        // No overpayment, use standard schedule
        // Check if loan can be repaid within solvency period
        if (monthsToRepayWithoutOverpayment > maxMonths) {
            cannotRepayInTime = true;
            // Calculate schedule limited to solvency period
            schedule = mortgageSchedule(actualLoan, monthlyRate, monthlyPayment, 0, maxMonths);
            actualMonthsUsed = maxMonths;
            totalPaid = schedule.totalPaid;
            actualLoanAfterLumpSum = schedule.balances.length > 0 ? schedule.balances[schedule.balances.length - 1] : 0;
        } else {
            schedule = scheduleWithoutOverpayment;
            actualMonthsUsed = monthsToRepayWithoutOverpayment;
            totalPaid = schedule.totalPaid;
            actualLoanAfterLumpSum = schedule.balances.length > 0 ? schedule.balances[schedule.balances.length - 1] : 0;
        }
    }

    // Calculate total interest paid
    // Total interest = total paid - original loan amount
    // When lump sum payment is applied, it reduces principal, which reduces interest and shortens the term
    const totalInterest = totalPaid - actualLoan;
    
    // Calculate interest saved due to lump sum payment
    // Calculate what interest would be without lump sum payment (standard schedule)
    let interestWithoutLumpSum = 0;
    if (lumpSumPayment > 0) {
        const standardSchedule = mortgageSchedule(actualLoan, monthlyRate, monthlyPayment, 0, maxMonths);
        interestWithoutLumpSum = standardSchedule.totalPaid - actualLoan;
    }
    const interestSaved = lumpSumPayment > 0 ? interestWithoutLumpSum - totalInterest : 0;

    // Build results table (try both possible IDs for compatibility)
    const tbody = document.querySelector('#mortgageCalcResult tbody') || document.querySelector('#result tbody');
    tbody.innerHTML = `
        <tr>
            <td>Максимальна сума іпотеки (PLN)</td>
            <td style="font-weight: bold; font-size: 1.1em; color: #2a7f62;">${formatPLN(maxMortgageAmount)}</td>
        </tr>
        <tr>
            <td>Необхідний перший внесок (PLN)</td>
            <td>${formatPLN(requiredDownPayment)}</td>
        </tr>
        <tr>
            <td>Сума кредиту (PLN)</td>
            <td>${formatPLN(actualLoan)}</td>
        </tr>
        <tr>
            <td>Щомісячний платіж (PLN/міс)</td>
            <td>${formatPLN(monthlyPayment)}</td>
        </tr>
        ${lumpSumPayment > 0 ? `
        <tr>
            <td>Загальна сума переплат (PLN)</td>
            <td>${formatPLN(lumpSumPayment)}</td>
        </tr>
        ${actualLoanAfterLumpSum > 0.01 ? `
        <tr>
            <td>Залишок кредиту після всіх переплат (PLN)</td>
            <td style="color: #d32f2f; font-weight: bold;">${formatPLN(actualLoanAfterLumpSum)}</td>
        </tr>
        ` : ''}
        <tr>
            <td>Термін погашення з урахуванням переплати</td>
            <td style="font-weight: bold; color: #2a7f62;">${formatYears(actualMonthsUsed)}</td>
        </tr>
        <tr>
            <td>Термін погашення без переплати</td>
            <td>${formatYears(monthsToRepayWithoutOverpayment)}</td>
        </tr>
        <tr>
            <td>Термін іпотеки (за договором)</td>
            <td>${formatYears(monthsTotal)}</td>
        </tr>
        <tr>
            <td>Період платоспроможності</td>
            <td>${formatYears(maxMonths)}</td>
        </tr>
        <tr>
            <td>Економія часу завдяки переплаті</td>
            <td style="font-weight: bold; color: #2a7f62;">${formatYears(monthsToRepayWithoutOverpayment - actualMonthsUsed)}</td>
        </tr>
        ` : `
        <tr>
            <td>Термін погашення</td>
            <td style="font-weight: bold; color: #2a7f62;">${formatYears(actualMonthsUsed)}</td>
        </tr>
        <tr>
            <td>Термін іпотеки (за договором)</td>
            <td>${formatYears(monthsTotal)}</td>
        </tr>
        <tr>
            <td>Період платоспроможності</td>
            <td>${formatYears(maxMonths)}</td>
        </tr>
        ${actualLoanAfterLumpSum > 0.01 ? `
        <tr>
            <td>Залишок кредиту після періоду платоспроможності (PLN)</td>
            <td style="color: #d32f2f; font-weight: bold;">${formatPLN(actualLoanAfterLumpSum)}</td>
        </tr>
        ` : ''}
        `}
        ${cannotRepayInTime ? `
        <tr>
            <td colspan="2" style="color: #d32f2f; font-weight: bold; padding: 10px;">
                ⚠️ Увага: Кредит не може бути повністю погашений за період платоспроможності (${formatYears(maxMonths)}). 
                Залишок кредиту: ${formatPLN(actualLoanAfterLumpSum)}
            </td>
        </tr>
        ` : ''}
        <tr>
            <td>Загальна сума виплат (PLN)</td>
            <td>${formatPLN(totalPaid)}</td>
        </tr>
        <tr>
            <td>Загальна переплата (відсотки, PLN)</td>
            <td>${formatPLN(totalInterest)}</td>
        </tr>
        ${lumpSumPayment > 0 ? `
        <tr>
            <td>Економія на відсотках завдяки переплаті (PLN)</td>
            <td style="font-weight: bold; color: #2a7f62;">${formatPLN(interestSaved)}</td>
        </tr>
        ` : ''}
        ${lumpSumPayment > 0 ? `
        <tr>
            <td>Щомісячна сума для переплати (PLN/міс)</td>
            <td>${formatPLN(inputs.lumpSumPaymentMonthly)}</td>
        </tr>
        ` : ''}
    `;

    // Create chart showing loan balance over time
    const chartContainer = document.getElementById('chartContainer') || document.getElementById('chartContainerMortgage');
    const chartCanvas = document.getElementById('chart') || document.getElementById('chartMortgage');
    
    if (schedule.balances && schedule.balances.length > 0 && chartCanvas) {
        createChart(schedule.balances, actualMonthsUsed, chartCanvas);
        if (chartContainer) chartContainer.style.display = 'block';
    } else {
        if (chartContainer) chartContainer.style.display = 'none';
    }
}

/**
 * Create chart showing loan balance reduction over time
 */
function createChart(balances, monthsUsed, canvasElement) {
    // Create labels for chart (every 6 months or at key points)
    const labels = [];
    const data = [];
    const step = Math.max(1, Math.floor(monthsUsed / 20)); // Show ~20 points
    
    for (let i = 0; i < balances.length; i += step) {
        const months = i + 1;
        const years = Math.floor(months / 12);
        const monthsRem = months % 12;
        
        if (years === 0) {
            labels.push(`${months} міс`);
        } else if (monthsRem === 0) {
            labels.push(`${years} р.`);
        } else {
            labels.push(`${years} р. ${monthsRem} міс`);
        }
        
        data.push(balances[i]);
    }
    
    // Add last point if not already included
    if (balances.length > 0 && (balances.length - 1) % step !== 0) {
        const lastMonths = balances.length;
        const lastYears = Math.floor(lastMonths / 12);
        const lastMonthsRem = lastMonths % 12;
        
        if (lastYears === 0) {
            labels.push(`${lastMonths} міс`);
        } else if (lastMonthsRem === 0) {
            labels.push(`${lastYears} р.`);
        } else {
            labels.push(`${lastYears} р. ${lastMonthsRem} міс`);
        }
        
        data.push(balances[balances.length - 1]);
    }

    // Update chart
    if (chart) chart.destroy();
    const ctx = (canvasElement || document.getElementById('chart') || document.getElementById('chartMortgage')).getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels, 
            datasets: [{
                label: 'Залишок боргу (PLN)',
                data: data,
                borderColor: '#2a7f62',
                backgroundColor: 'rgba(42, 127, 98, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Динаміка погашення іпотеки',
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
                        text: 'Залишок боргу (PLN)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('uk-UA') + ' PLN';
                        }
                    },
                    beginAtZero: true
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
 * Save input values to localStorage
 */
function saveToLocalStorage() {
    const inputs = [
        { id: 'mortgageRate', key: 'mortgageRate' },
        { id: 'mortgageYears', key: 'mortgageYears' },
        { id: 'mortgageDown', key: 'mortgageDown' },
        { id: 'mortgageCalcSolvency', key: 'solvency' },
        { id: 'solvency', key: 'solvency' }, // fallback
        { id: 'mortgageCalcMonthlyPayment', key: 'monthlyPayment' },
        { id: 'monthlyPayment', key: 'monthlyPayment' }, // fallback
        { id: 'lumpSumPaymentMonthly', key: 'lumpSumPaymentMonthly' }
    ];
    
    inputs.forEach(({ id, key }) => {
        const element = document.getElementById(id);
        if (element) {
            localStorage.setItem(`mortgage_calc_${key}`, element.value);
        }
    });
}

/**
 * Load input values from localStorage
 */
function loadFromLocalStorage() {
    const inputs = [
        { id: 'mortgageRate', key: 'mortgageRate' },
        { id: 'mortgageYears', key: 'mortgageYears' },
        { id: 'mortgageDown', key: 'mortgageDown' },
        { id: 'mortgageCalcSolvency', key: 'solvency' },
        { id: 'solvency', key: 'solvency' }, // fallback
        { id: 'mortgageCalcMonthlyPayment', key: 'monthlyPayment' },
        { id: 'monthlyPayment', key: 'monthlyPayment' }, // fallback
        { id: 'lumpSumPaymentMonthly', key: 'lumpSumPaymentMonthly' }
    ];
    
    inputs.forEach(({ id, key }) => {
        const element = document.getElementById(id);
        if (element) {
            const savedValue = localStorage.getItem(`mortgage_calc_${key}`);
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
        recalcMortgage();
    });
});
recalcMortgage();
