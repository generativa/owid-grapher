import * as React from "react"
import { computed, observable, action } from "mobx"
import { observer } from "mobx-react"
import classnames from "classnames"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons/faInfoCircle"

import { ChartConfig } from "./ChartConfig"
import { SortOrder } from "./SortOrder"
import { capitalize, some, orderBy, upperFirst } from "./Util"
import { SortIcon } from "./SortIcon"
import { Tippy } from "./Tippy"
import {
    DataTableTransform,
    DataTableRow,
    TargetYearMode,
    ColumnKey,
    isSingleValue,
    DataTableDimension,
    DataTableColumn,
    DimensionValue,
    isRangeValue,
    RangeValueKey,
    SingleValueKey,
    Value
} from "./DataTableTransform"

export interface DataTableProps {
    chart: ChartConfig
}

export interface DataTableState {
    sort: DataTableSortState
}

const ENTITY_DIM_INDEX = -1

export type DimensionIndex = number

export interface DataTableSortState {
    dimIndex: DimensionIndex
    columnKey: ColumnKey | undefined
    order: SortOrder
}

const DEFAULT_SORT_STATE: DataTableSortState = {
    dimIndex: ENTITY_DIM_INDEX,
    columnKey: undefined,
    order: SortOrder.asc
}

const columnNameByType: Record<ColumnKey, string> = {
    single: "Value",
    start: "Start",
    end: "End",
    delta: "Change",
    deltaRatio: "Change (%)"
}

function inverseSortOrder(order: SortOrder): SortOrder {
    return order === SortOrder.asc ? SortOrder.desc : SortOrder.asc
}

@observer
export class DataTable extends React.Component<DataTableProps> {
    @observable private storedState: DataTableState = {
        sort: DEFAULT_SORT_STATE
    }

    @computed get tableState(): DataTableState {
        return {
            sort: this.sortState
        }
    }

    @computed get sortState(): DataTableSortState {
        let { dimIndex, columnKey, order } = {
            ...DEFAULT_SORT_STATE,
            ...this.storedState.sort
        }

        // If not sorted by entity, then make sure the index of the chosen column exists
        dimIndex = Math.min(dimIndex, this.transform.dimensions.length - 1)
        if (dimIndex !== ENTITY_DIM_INDEX) {
            const availableColumns = this.transform.dimensionsWithValues[
                dimIndex
            ].columns.map(sub => sub.key)
            if (
                columnKey === undefined ||
                !availableColumns.includes(columnKey)
            ) {
                columnKey = availableColumns[0]
            }
        }

        return {
            dimIndex,
            columnKey,
            order
        }
    }

    @computed get entityType() {
        return this.props.chart.entityType
    }

    @computed get transform() {
        return new DataTableTransform(this.props.chart)
    }

    @computed get sortValueMapper(): (
        row: DataTableRow
    ) => number | string | undefined {
        const { dimIndex, columnKey, order } = this.tableState.sort

        if (dimIndex === ENTITY_DIM_INDEX) {
            return row => row.entity
        }

        return row => {
            const dv = row.dimensionValues[dimIndex] as DimensionValue

            let value: number | string | undefined
            if (dv) {
                if (isSingleValue(dv)) {
                    value = dv.single?.value
                } else if (
                    isRangeValue(dv) &&
                    columnKey !== undefined &&
                    columnKey in RangeValueKey
                ) {
                    value = dv[columnKey as RangeValueKey]?.value
                }
            }

            // We always want undefined values to be last
            if (
                value === undefined ||
                (typeof value === "number" &&
                    (!isFinite(value) || isNaN(value)))
            ) {
                return order === SortOrder.asc ? Infinity : -Infinity
            }

            return value
        }
    }

    @computed get displayDimensions() {
        return this.transform.displayDimensions
    }

    @computed get displayRows() {
        const { order } = this.tableState.sort
        return orderBy(this.transform.displayRows, this.sortValueMapper, [
            order
        ])
    }

    @computed get hasSubheaders() {
        return some(this.displayDimensions, header => header.columns.length > 1)
    }

    @action.bound updateSort(dimIndex: DimensionIndex, columnKey?: ColumnKey) {
        const { sort } = this.tableState
        const order =
            sort.dimIndex === dimIndex && sort.columnKey === columnKey
                ? inverseSortOrder(sort.order)
                : SortOrder.asc

        this.storedState.sort.dimIndex = dimIndex
        this.storedState.sort.columnKey = columnKey
        this.storedState.sort.order = order
    }

    private get entityHeader() {
        const { sort } = this.tableState
        return (
            <ColumnHeader
                key="entity"
                sortable={true}
                sortedCol={sort.dimIndex === ENTITY_DIM_INDEX}
                sortOrder={sort.order}
                onClick={() => this.updateSort(ENTITY_DIM_INDEX)}
                rowSpan={this.hasSubheaders ? 2 : 1}
                headerText={capitalize(this.entityType)}
                colType="entity"
                dataType="text"
            />
        )
    }

    private get dimensionHeaders() {
        const { sort } = this.tableState
        return this.displayDimensions.map((dim, dimIndex) => {
            const dimensionHeaderText = (
                <React.Fragment>
                    <span className="name">{upperFirst(dim.name)}</span>
                    <span className="unit">{dim.unit}</span>
                </React.Fragment>
            )

            const props = {
                sortable: dim.sortable,
                sortedCol: dim.sortable && sort.dimIndex === dimIndex,
                sortOrder: sort.order,
                onClick: () =>
                    dim.sortable &&
                    this.updateSort(dimIndex, SingleValueKey.single),
                rowSpan: this.hasSubheaders && dim.columns.length < 2 ? 2 : 1,
                colSpan: dim.columns.length,
                headerText: dimensionHeaderText,
                colType: "dimension" as const,
                dataType: "numeric" as const
            }

            return <ColumnHeader key={dim.key} {...props} />
        })
    }

    private get dimensionSubheaders() {
        const { sort } = this.tableState
        return this.displayDimensions.map((dim, dimIndex) =>
            dim.columns.map(column => {
                const headerText =
                    column.targetYearMode === TargetYearMode.point
                        ? dim.formatYear(column.targetYear!)
                        : columnNameByType[column.key]
                return (
                    <ColumnHeader
                        key={column.key}
                        sortable={column.sortable}
                        sortedCol={
                            sort.dimIndex === dimIndex &&
                            sort.columnKey === column.key
                        }
                        sortOrder={sort.order}
                        onClick={() => this.updateSort(dimIndex, column.key)}
                        headerText={headerText}
                        colType="subdimension"
                        dataType="numeric"
                    />
                )
            })
        )
    }

    private get headerRow() {
        return (
            <React.Fragment>
                <tr>
                    {this.entityHeader}
                    {this.dimensionHeaders}
                </tr>
                {this.hasSubheaders && <tr>{this.dimensionSubheaders}</tr>}
            </React.Fragment>
        )
    }

    private renderValueCell(
        key: string,
        column: DataTableColumn,
        dv: DimensionValue | undefined,
        sorted: boolean,
        formatYear: (y: number) => string
    ) {
        let value: Value | undefined

        if (dv !== undefined && isSingleValue(dv) && column.key in dv) {
            value = dv[column.key as SingleValueKey] as Value
        } else if (dv !== undefined && isRangeValue(dv) && column.key in dv) {
            value = dv[column.key as RangeValueKey] as Value
        }

        if (value === undefined) {
            return <td key={key} className="dimension" />
        }

        return (
            <td
                key={key}
                className={classnames([
                    "dimension",
                    `dimension-${column.key}`,
                    {
                        sorted: sorted
                    }
                ])}
            >
                {value.year !== undefined &&
                    column.targetYearMode === TargetYearMode.point &&
                    column.targetYear !== undefined &&
                    column.targetYear !== value.year && (
                        <ClosestYearNotice
                            closestYear={formatYear(value.year)}
                            targetYear={formatYear(column.targetYear)}
                        />
                    )}
                {value.formattedValue}
                {value.year !== undefined &&
                    column.targetYearMode === TargetYearMode.range && (
                        <span className="range-year"> in {value.year}</span>
                    )}
            </td>
        )
    }

    renderEntityRow(row: DataTableRow, dimensions: DataTableDimension[]) {
        const { sort } = this.tableState
        return (
            <tr key={row.entity}>
                <td
                    key="entity"
                    className={classnames({
                        entity: true,
                        sorted: sort.dimIndex === ENTITY_DIM_INDEX
                    })}
                >
                    {row.entity}
                </td>
                {row.dimensionValues.map((dv, dimIndex) => {
                    const dimension = dimensions[dimIndex]
                    return dimension.columns.map((column, colIndex) => {
                        const key = `${dimIndex}-${colIndex}`
                        return this.renderValueCell(
                            key,
                            column,
                            dv,
                            sort.dimIndex === dimIndex &&
                                sort.columnKey === column.key,
                            dimension.formatYear
                        )
                    })
                })}
            </tr>
        )
    }

    private get valueRows() {
        return this.displayRows.map(row =>
            this.renderEntityRow(row, this.displayDimensions)
        )
    }

    render() {
        return (
            <table className="data-table">
                <thead>{this.headerRow}</thead>
                <tbody>{this.valueRows}</tbody>
            </table>
        )
    }
}

function ColumnHeader(props: {
    sortable: boolean
    sortedCol: boolean
    sortOrder: SortOrder
    onClick: () => void
    rowSpan?: number
    colSpan?: number
    headerText: React.ReactFragment
    colType: "entity" | "dimension" | "subdimension"
    dataType: "text" | "numeric"
}) {
    const { sortable, sortedCol } = props
    return (
        <th
            className={classnames(props.colType, {
                sortable: sortable,
                sorted: sortedCol
            })}
            rowSpan={props.rowSpan ?? 1}
            colSpan={props.colSpan ?? 1}
            onClick={props.onClick}
        >
            {props.headerText}
            {sortable && (
                <SortIcon
                    type={props.dataType}
                    isActiveIcon={sortedCol}
                    order={
                        sortedCol ? props.sortOrder : DEFAULT_SORT_STATE.order
                    }
                />
            )}
        </th>
    )
}

export const ClosestYearNotice = ({
    targetYear,
    closestYear: year
}: {
    targetYear: string
    closestYear: string
}) => (
    <Tippy
        content={
            <div className="closest-year-notice">
                <strong>Data not available for {targetYear}</strong>
                <br />
                Showing closest available data point ({year})
            </div>
        }
        arrow={false}
    >
        <span className="notice">
            in {year}{" "}
            <span className="icon">
                <FontAwesomeIcon icon={faInfoCircle} />
            </span>
        </span>
    </Tippy>
)
