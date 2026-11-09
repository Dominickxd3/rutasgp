import { Tag } from 'primereact/tag';

interface ModulePlaceholderProps {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
}

export function ModulePlaceholder({
  icon,
  eyebrow,
  title,
  description,
}: ModulePlaceholderProps) {
  return (
    <section className="fleet-panel module-placeholder">
      <header className="fleet-panel__head">
        <div className="fleet-panel__heading">
          <div>
            <p className="fleet-panel__eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <Tag value="Próximamente" severity="info" />
        </div>
      </header>

      <div className="module-placeholder__body">
        <span className="module-placeholder__icon" aria-hidden="true">
          <i className={icon} />
        </span>
        <p>{description}</p>
        <p className="module-placeholder__note">
          La navegación ya está disponible. La integración con el ERP se
          incorporará en una siguiente etapa sin alterar los módulos de
          monitoreo GPS.
        </p>
      </div>
    </section>
  );
}
