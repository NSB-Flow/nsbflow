import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground mt-1">{description}</p>
      <Card className="mt-6">
        <CardContent className="py-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Construction className="h-6 w-6 text-gold" />
          </div>
          <h2 className="font-display text-xl font-semibold">Em breve</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            Este módulo já está previsto na arquitetura da plataforma e será
            liberado nas próximas entregas mantendo o mesmo padrão de UX, dados e
            geração de PDF do DEAP Meeting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
