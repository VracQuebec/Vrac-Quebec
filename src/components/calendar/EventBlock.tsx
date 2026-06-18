import { CalendarEvent, Truck, Driver, statusBg, statusBgSoft, statusBorder, formatTime, TRUCK_TYPE_LABELS } from "@/lib/calendar-utils";

interface Props {
  event: CalendarEvent;
  trucksById: Map<string, Truck>;
  driversById: Map<string, Driver>;
  onClick: () => void;
  compact?: boolean;
}

export default function EventBlock({ event, trucksById, driversById, onClick, compact }: Props) {
  const truck = event.truck_id ? trucksById.get(event.truck_id) : null;
  const driver = event.driver_id ? driversById.get(event.driver_id) : null;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-2 py-1.5 border text-xs leading-tight transition-shadow hover:shadow-md"
      style={{
        background: statusBgSoft(event.status),
        borderColor: statusBorder(event.status),
        color: "hsl(var(--foreground))",
      }}
    >
      <div className="flex items-center gap-1.5 font-display font-semibold">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusBg(event.status) }} />
        <span className="truncate">
          {formatTime(event.start_at)}
          {event.dompe_number && ` • Dompe ${event.dompe_number}`}
        </span>
      </div>
      {!compact && (
        <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
          {truck && <div className="truncate">{TRUCK_TYPE_LABELS[truck.type]} — {truck.name}</div>}
          {driver && <div className="truncate">{driver.name}</div>}
          {event.trips_planned ? <div>{event.trips_planned} voyages</div> : null}
        </div>
      )}
    </button>
  );
}