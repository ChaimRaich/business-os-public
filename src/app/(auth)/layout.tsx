import { EntryScreen } from "@/components/brand";
import { RotatingText } from "@/components/motion";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <EntryScreen
      badge="מערכת הפעלה לעסק קטן ובינוני"
      title={
        <>
          עסק שמפעיל את עצמו.
          <br />
          <RotatingText phrases={["מזמין מה שחסר.", "יוזם מבצעים.", "סוגר את החודש.", "אתם רק מאשרים."]} />
        </>
      }
      lede="Business OS עוקב אחרי המלאי, המכירות והכספים, ויוזם בעצמו את הצעד הבא: הזמנה לספק כשחסר מלאי, מבצע למוצר שלא זז, והחומר החודשי לרואה החשבון. אתם רק מאשרים."
    >
      {children}
    </EntryScreen>
  );
}
