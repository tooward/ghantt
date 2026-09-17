/**
 * Local declarations for `frappe-gantt@1.2.2`, which ships none.
 *
 * Do NOT install `@types/frappe-gantt`: it is stuck at 0.9.0 against a very
 * different API, so it would typecheck cleanly and be wrong at runtime.
 *
 * Everything here was read from the installed source, not from the README.
 */
declare module 'frappe-gantt' {
  export interface FrappeTask {
    id: string
    name: string
    /** 'YYYY-MM-DD'. Formatted in local time — see ARCHITECTURE.md §5.3. */
    start: string
    end: string
    progress: number
    dependencies: string[]
    custom_class?: string
  }

  export type FrappeViewMode =
    | 'Hour'
    | 'Quarter Day'
    | 'Half Day'
    | 'Day'
    | 'Week'
    | 'Month'
    | 'Year'

  /** Options are snake_case. */
  export interface FrappeOptions {
    view_mode?: FrappeViewMode
    readonly?: boolean
    bar_height?: number
    column_width?: number
    arrow_curve?: number
    container_height?: number | 'auto'
    infinite_padding?: boolean
    today_button?: boolean
    scroll_to?: string
    /** `false` disables the built-in popup entirely. */
    popup?: false | ((ctx: unknown) => string | false | void)
    popup_on?: 'click' | 'hover'
    /**
     * Dispatched through `trigger_event('click')`, which looks options up by
     * name at call time — it is real despite being absent from DEFAULT_OPTIONS.
     */
    on_click?: (task: FrappeTask) => void
    on_view_change?: (mode: unknown) => void
  }

  export default class Gantt {
    constructor(wrapper: string | HTMLElement | SVGElement, tasks: FrappeTask[], options?: FrappeOptions)
    /** The instance method. The README's `gantt.tasks.refresh()` does not exist. */
    refresh(tasks: FrappeTask[]): void
    change_view_mode(mode?: string, maintain_pos?: boolean): void
    clear(): void
    tasks: FrappeTask[]
  }
}
