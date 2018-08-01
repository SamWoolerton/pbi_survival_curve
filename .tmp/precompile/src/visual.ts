"use strict";

module powerbi.extensibility.visual.survivalCurve65DB9C0426974F3E8363EA24EA3A9954  {
    export class Visual implements IVisual {
        private target: HTMLElement;
        private settings: VisualSettings;
        private colorPalette;

        constructor(options: VisualConstructorOptions) {
            this.target = options.element;
            this.target.innerHTML = `
                <div>
                    <canvas id="chartId" />
                </div>
            `;
            this.colorPalette = options.host.colorPalette;
        }

        public update(options: VisualUpdateOptions) {
            this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);

            // data handling
            // TODO: handle multiple datasets
            const {
                values: data,
                maxLocal: max
            } = options.dataViews[0].categorical.values["0"]
            const startCustomers = data.length
            const disconnectionsByDay = []
            const chartLabel = []

            // create array from 0 to max
            for (let i = 0; i <= max; i ++) {
                disconnectionsByDay[i] = 0
                chartLabel[i] = i
            }

            // pivot data to be stored by day (array index), only holding count of disconnections on that day
            data.reduce((total, next) => {
                total[next] += 1
                return total
            }, disconnectionsByDay)

            // create lifetime % by day
            const { retentionByDay } = disconnectionsByDay.reduce(({ retentionByDay, runningTotal }, disconnections) => {
                runningTotal -= ((disconnections / startCustomers) * 100)
                retentionByDay.push(Math.round(runningTotal * 10) / 10)
                return { retentionByDay, runningTotal }
            }, {
                retentionByDay: [],
                runningTotal: 100
            })

            // this.target.innerHTML = `
            //     Color: ${this.colorPalette.colors[0].value}
            //     Data: ${JSON.stringify(data)}
            //     Data length: ${data.length}
            //     Highest lifetime: ${max}
            //     Arr to max: ${JSON.stringify(disconnectionsByDay)}
            // `

            // building the chart
            // note that the <any> type hint stops the compiler from complaining
            const { Chart } = (<any>window)
            new Chart("chartId", {
                type: 'line',
                data: {
                    labels: decimateData(chartLabel),
                    datasets: [
                        {
                            label: "Base",
                            data: decimateData(retentionByDay),
                            ...getColors(this.colorPalette, 0)
                        }
                    ]
                },
                options: {
                    scales: {
                        xAxes: [{
                            scaleLabel: {
                                labelString: "Days",
                                display: true
                            },
                            ticks: {
                                min: 0,
                                max
                            }
                        }],
                        yAxes: [{
                            ticks: {
                                min: 0,
                                max: 100,
                                callback(value) {
                                    return `${value}%`
                                }
                            }
                        }],
                    },
                    legend: {
                        // hide legend if only one dataset
                        display: options.dataViews.length > 1,
                        position: 'right'
                    },
                    tooltips: {
                        callbacks: {
                            label(tooltipItem, data) {
                                return [
                                    `Days: ${tooltipItem.xLabel}`,
                                    `% remaining: ${tooltipItem.yLabel}%`,
                                ]
                            },
                            title([ tooltipItem ], data) {
                                return data.datasets[tooltipItem.datasetIndex].label || "Tooltip"
                            }
                        }
                    },
                },
            })
        }

        /**
         * Don't touch anything below here
         */

        private static parseSettings(dataView: DataView): VisualSettings {
            return VisualSettings.parse(dataView) as VisualSettings;
        }

        /**
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
         * objects and properties you want to expose to the users in the property pane.
         *
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
            return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
        }
    }
}

/**
 * decimates data based on provided cutoff, defaulting to 20 values
 */
function decimateData(data, cutoff = 30) {
    const pointsCount = data.length

    if (pointsCount < cutoff) {
        // data is sparse enough that there's no need to decimate it
        return data
    }

    // round to nearest integer
    let stepNaive = Math.round(pointsCount / cutoff)
    // round to nearest 10/100/...
    let stepRounded = roundStep(stepNaive)

    // due to the nature of a categorical axis, loses some data at top end
    // niggly but can't do anything about it without forking Chart.js or changing chart library
    return data.filter((_, index) =>  index % stepRounded === 0 )
}

/**
 * round step based on scale
 */
function roundStep(step) {
    const scale = getScale(step, step > 1 ? "down" : "up")

    // scale step, round, scale back
    return ( Math.round(step / (10 ** scale)) * (10 ** scale) )
}

/**
 * calculate 'depth' for given val
 * where depth is the number of times to multiply/divide by 10 for val to between 1 and 10
 */
function getScale(val, direction, depth = 1) {
    // exit condition to prevent infinite recursion
    if (val > 1 && val < 10) {
        return depth
    }

    if (direction === "down") {
        return getScale(val / 10, "down", depth++)
    } else {
        return getScale(val * 10, "down", depth++)
    }

}

/**
 * Original at https://stackoverflow.com/a/5624139/7170445
 */
function hexToRGBA(hex, opacity = 1) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return `rgba(
        ${parseInt(result[1], 16)},
        ${parseInt(result[2], 16)},
        ${parseInt(result[3], 16)},
        ${opacity})
    `
}

function getColors(colorPalette, index) {
    return {
        backgroundColor: hexToRGBA(colorPalette.colors[index].value, 0.2),
        borderColor: hexToRGBA(colorPalette.colors[index].value),
        pointBackgroundColor: hexToRGBA(colorPalette.colors[index].value),
        pointBorderColor: hexToRGBA(colorPalette.colors[index].value),
    }
}