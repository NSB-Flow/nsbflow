import { Bell, Check, Trash2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, useMarkNotification, type NotificationSeverity } from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const iconFor = (s: NotificationSeverity) =>
  s === "critical" ? <AlertCircle className="h-4 w-4 text-destructive" />
  : s === "warning" ? <AlertTriangle className="h-4 w-4 text-gold" />
  : <Info className="h-4 w-4 text-muted-foreground" />;

export function NotificationsBell() {
  const { data = [] } = useNotifications(30);
  const { markRead, markAllRead, remove } = useMarkNotification();
  const unread = data.filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium text-sm">Notificações</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead()} className="h-7 text-xs">
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {data.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação por aqui.
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((n) => {
                const inner = (
                  <div className="flex gap-3 px-4 py-3 hover:bg-muted/50">
                    <div className="mt-0.5">{iconFor(n.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`text-sm truncate ${n.read_at ? "text-muted-foreground" : "font-medium"}`}>
                          {n.title}
                        </div>
                        {!n.read_at && <Badge variant="secondary" className="h-4 px-1 text-[9px]">novo</Badge>}
                      </div>
                      {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {!n.read_at && (
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n.id); }}
                          aria-label="Marcar como lida"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(n.id); }}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.action_url ? (
                      <Link to={n.action_url} onClick={() => !n.read_at && markRead(n.id)}>
                        {inner}
                      </Link>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
