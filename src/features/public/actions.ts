import {
  BadgeCheck,
  ClipboardPenLine,
  Fuel,
  HardHat,
  PackagePlus,
  Shield,
  Warehouse,
} from 'lucide-react';

export const soldierActions = [
  {
    id: 'details',
    title: 'רישום פרטים אישיים',
    description: 'שם, מספר אישי, מחלקה ופרטי קשר.',
    icon: BadgeCheck,
    accent: 'green',
  },
  {
    id: 'weapon',
    title: 'רישום נשק',
    description: 'רישום מספרי הנשק, האקילה והכוונת.',
    icon: Shield,
    accent: 'blue',
  },
  {
    id: 'equipment',
    title: 'חתימה על ציוד',
    description: 'קסדה, ווסט, מחסניות וציוד אישי נוסף.',
    icon: ClipboardPenLine,
    accent: 'violet',
  },
  {
    id: 'shortage',
    title: 'בקשת ציוד או דיווח חוסר',
    description: 'חסר לכם פריט? שלחו בקשה מסודרת לטיפול.',
    icon: PackagePlus,
    accent: 'amber',
  },
  {
    id: 'deposit',
    title: 'אפסון נשק בארמון',
    description: 'מסירת נשק לאחסון ורישום פרטי ההפקדה.',
    icon: Warehouse,
    accent: 'teal',
  },
  {
    id: 'refuel',
    title: 'דיווח תדלוק',
    description: 'פרטי הרכב, כרטיס התדלוק והכמות שמולאה.',
    icon: Fuel,
    accent: 'indigo',
  },
  {
    id: 'fault',
    title: 'דיווח תקלת בינוי',
    description: 'נזילה, חשמל, מיזוג או כל תקלה במבנה.',
    icon: HardHat,
    accent: 'rose',
  },
] as const;

export type SoldierAction = (typeof soldierActions)[number];
