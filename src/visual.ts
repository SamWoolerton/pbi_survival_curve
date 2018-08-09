"use strict";

module powerbi.extensibility.visual {
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
            const sourceDatasets = options.dataViews[0].categorical.values
            const { colorPalette } = this

            const filteredDatasets = sourceDatasets.map(({ source, values }) => ({
                label: source.groupName,
                data: values.filter(isNotNull)
            }))

            const pivotedDatasets = filteredDatasets.map(({ label, data }) => ({
                label,
                initial: data.length,
                data: pivotByDay(data)
            }))

            // create lifetime % by day
            const processedDatasets = pivotedDatasets.map(({ label, initial, data }) => ({
                label,
                data: data.reduce(({ runningTotal, retentionByDay }, disconnections) => {
                    runningTotal -= disconnections
                    retentionByDay.push(Math.round(runningTotal / initial * 100))
                    return { retentionByDay, runningTotal, initial }
                }, {
                    // starting values passed into reduce
                    runningTotal: initial,
                    retentionByDay: [],
                }).retentionByDay
            }))

            const maxLength = max(processedDatasets.map(({ data }) => data.length))
            const decimate = getDecimator(maxLength)

            const labels = decimate( generateArray(maxLength, { increment: true }) )
            const datasets = processedDatasets.map(({ label, data }, index) => ({
                label,
                data: decimate(data),
                ...getColors(colorPalette, index)
            }))

            // building the chart
            // note that the <any> type hint for window stops the compiler from complaining
            const { Chart } = (<any>window)
            new Chart("chartId", {
                type: 'line',
                data: {
                    labels,
                    datasets
                },
                options: {
                    scales: {
                        xAxes: [{
                            scaleLabel: {
                                labelString: "Days",
                                display: true
                            },
                            ticks: {
                                min: 0
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
                        display: datasets.length > 1,
                        position: 'right'
                    },
                    tooltips: {
                        callbacks: {
                            label(tooltipItem) {
                                return [
                                    `Days: ${tooltipItem.xLabel}`,
                                    `% remaining: ${tooltipItem.yLabel}%`,
                                ]
                            },
                            title([ tooltipItem ], data) {
                                return data.datasets[tooltipItem.datasetIndex].label || "Tooltip"
                            },
                            labelColor(tooltipItem) {
                                const color = colorPalette.colors[tooltipItem.datasetIndex].value
                                return {
                                    borderColor: color,
                                    backgroundColor: color
                                }
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
 * Helper function to create array filled with `max` zeroes
 * Used in reduce functions above
 */
function generateArray(max, { increment } = { increment: true }) {
    const arr = []

    for (let i = 0; i <= max; i ++) {
        arr[i] = increment ? i : 0
    }

    return arr
}

/**
 * Check that value isn't null
 * Used in filter above
 */
function isNotNull(val) {
    return val !== null
}

/**
 * Get max value in array
 */
function max(arr) {
    return arr.reduce((a, b) => Math.max(a, b))
}

function pivotByDay(arr) {
    return arr.reduce((total, next) => {
        total[next] += 1
        return total
    }, generateArray(max(arr), { increment: false }) )
}

/**
 * Returns decimator function
 * Doing like this so that all datasets and labels are decimated the same way, rather than from scratch each time
 * Would otherwise break labels
 */
function getDecimator(maxLength, cutoff = 30) {
    if (maxLength < cutoff) {
        // all data is sparse enough that there's no need to decimate it
        // expecting a function returned, so return a function that leaves all data unchanged
        // note that if one category is sparse and others aren't, sparse category will still be decimated - pitfall of the Chart.js line axis being categorical only
        return data => data
    }

    return data => {
        // round to nearest integer
        const stepNaive = Math.round(maxLength / cutoff)

        // round to nearest power of 10
        const stepRounded = roundStep(stepNaive)

        // due to the nature of a categorical axis, loses some data at top end
        // niggly but can't do anything about it without forking Chart.js or changing chart library
        return data.filter((_, index) =>  index % stepRounded === 0 )
    }
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