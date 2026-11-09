import type { UserProfile } from '../types/user-profile.types';

interface SidebarUserProfileProps {
  profile: UserProfile;
  connectionTime: string;
  collapsed: boolean;
  onClick: () => void;
}

export function SidebarUserProfile({
  profile,
  connectionTime,
  collapsed,
  onClick,
}: SidebarUserProfileProps) {
  const initials = (profile.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  if (collapsed) {
    return (
      <button
        type="button"
        className="sidebar-user-profile-collapsed"
        onClick={onClick}
        title={`${profile.name} · ${profile.role} (Conectado hace ${connectionTime})`}
        aria-label="Perfil de usuario y configuración"
      >
        <div className="sidebar-user-avatar-box">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="sidebar-user-avatar-img"
            />
          ) : (
            <span className="sidebar-user-avatar-initials">{initials}</span>
          )}
          <span className="sidebar-user-status-dot" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="sidebar-user-profile-card"
      onClick={onClick}
      title="Clic para configurar foto, correo, teléfono o cerrar sesión"
      aria-label="Ver y configurar perfil de usuario"
    >
      <div className="sidebar-user-avatar-box">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className="sidebar-user-avatar-img"
          />
        ) : (
          <span className="sidebar-user-avatar-initials">{initials}</span>
        )}
        <span className="sidebar-user-status-dot" />
      </div>

      <div className="sidebar-user-details">
        <div className="sidebar-user-topline">
          <strong className="sidebar-user-name" title={profile.name}>
            {profile.name}
          </strong>
        </div>

        <span className="sidebar-user-role" title={profile.role}>
          {profile.role}
        </span>

        <span className="sidebar-user-connection">
          <span className="sidebar-user-live-indicator" />
          <span>En línea · {connectionTime}</span>
        </span>
      </div>

      <div className="sidebar-user-settings-icon" aria-hidden="true">
        <i className="pi pi-cog" />
      </div>
    </button>
  );
}

