import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/use-notifications";
import { formatDate } from "@/lib/format";

export function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: items = [] } = useNotifications(profile?.id);
  const markRead = useMarkNotificationsRead(profile?.id);
  const unread = items.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary underline"
              onClick={() => markRead.mutate("all")}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) markRead.mutate([n.id]);
                  if (n.fulfillment_id)
                    navigate({
                      to: "/fulfillment/$id",
                      params: { id: n.fulfillment_id },
                      search: { tab: undefined },
                    });
                }}
                className={`block w-full border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-secondary ${
                  n.read ? "" : "bg-primary/5"
                }`}
              >
                <p className="text-sm leading-snug">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
