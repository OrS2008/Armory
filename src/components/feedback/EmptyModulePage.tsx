export function EmptyModulePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="page">
      <header className="page-title">
        <div>
          <span className="eyebrow">ARMORY V2</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <div className="empty-state">
        <span aria-hidden="true">◇</span>
        <h2>המודול עדיין לא פעיל</h2>
        <p>הוא מופיע בניווט כדי להמחיש את ארכיטקטורת המוצר, אך אינו מסומן כממומש.</p>
      </div>
    </section>
  );
}
