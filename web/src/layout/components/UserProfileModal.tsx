import { useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import type { UserProfile } from '../types/user-profile.types';

interface UserProfileModalProps {
  visible: boolean;
  onHide: () => void;
  profile: UserProfile;
  connectionTime: string;
  sessionStartTime: number;
  onSave: (updated: Partial<UserProfile>) => void;
  onLogout: () => void;
}

export function UserProfileModal({
  visible,
  onHide,
  profile,
  connectionTime,
  sessionStartTime,
  onSave,
  onLogout,
}: UserProfileModalProps) {
  const [form, setForm] = useState<UserProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar los 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setForm((prev) => ({ ...prev, avatarUrl: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setForm((prev) => ({ ...prev, avatarUrl: '' }));
  };

  const handleSave = () => {
    onSave(form);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onHide();
    }, 600);
  };

  const sessionStartFormatted = new Date(sessionStartTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const initials = (form.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  return (
    <Dialog
      header="Perfil de Usuario & Configuración"
      visible={visible}
      onHide={onHide}
      className="user-profile-dialog"
      style={{ width: '500px', maxWidth: '95vw' }}
      draggable={false}
      resizable={false}
      dismissableMask
    >
      <div className="profile-dialog-content">
        {/* Top: Avatar and Profile Photo Edit */}
        <div className="profile-avatar-header">
          <div className="profile-avatar-wrapper">
            {form.avatarUrl ? (
              <img
                src={form.avatarUrl}
                alt="Foto de perfil"
                className="profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar-fallback">{initials}</div>
            )}
            <span
              className="profile-avatar-status-badge"
              title="Usuario en línea"
              aria-label="En línea"
            />
          </div>

          <div className="profile-avatar-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
              aria-label="Subir foto de perfil"
            />
            <Button
              type="button"
              label="Cambiar foto"
              icon="pi pi-camera"
              size="small"
              className="p-button-outlined p-button-sm"
              onClick={handleOpenFileInput}
            />
            {form.avatarUrl && (
              <Button
                type="button"
                label="Quitar"
                icon="pi pi-trash"
                size="small"
                severity="danger"
                className="p-button-text p-button-sm"
                onClick={handleRemovePhoto}
              />
            )}
          </div>
        </div>

        {/* Live Session / Connection Time Box */}
        <div className="profile-session-card">
          <div className="profile-session-row">
            <div className="profile-session-item">
              <span className="profile-session-label">Estado de conexión</span>
              <span className="profile-session-value profile-session-value--online">
                <span className="pulse-dot" /> En línea
              </span>
            </div>

            <div className="profile-session-item">
              <span className="profile-session-label">Tiempo conectado</span>
              <span className="profile-session-value">{connectionTime}</span>
            </div>

            <div className="profile-session-item">
              <span className="profile-session-label">Hora de inicio</span>
              <span className="profile-session-value">{sessionStartFormatted}</span>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="profile-form-grid">
          <div className="profile-field">
            <label htmlFor="user-name">Nombre completo</label>
            <InputText
              id="user-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="user-role">Rol en la empresa</label>
            <InputText
              id="user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Ej. Coordinador de Distribución"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="user-email">Correo electrónico</label>
            <InputText
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="usuario@gruppecuario.pe"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="user-phone">
              <span>Teléfono / Celular</span>
              <span className="profile-tag-telegram">Para Telegram</span>
            </label>
            <InputText
              id="user-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+51 987 654 321"
            />
            <small className="profile-field-hint">
              <i className="pi pi-send" /> Número requerido para la vinculación con el bot de Telegram y recepción de alertas de ruta.
            </small>
          </div>

          <div className="profile-field">
            <label htmlFor="user-telegram">Usuario de Telegram (opcional)</label>
            <InputText
              id="user-telegram"
              value={form.telegramUser ?? ''}
              onChange={(e) => setForm({ ...form, telegramUser: e.target.value })}
              placeholder="@usuario_telegram"
            />
          </div>
        </div>

        {/* Bottom Actions Row */}
        <div className="profile-dialog-footer">
          <Button
            type="button"
            label="Cerrar sesión"
            icon="pi pi-sign-out"
            severity="danger"
            className="p-button-outlined p-button-sm"
            onClick={onLogout}
            title="Salir y reiniciar sesión"
          />

          <div className="profile-dialog-footer-right">
            <Button
              type="button"
              label="Cancelar"
              icon="pi pi-times"
              className="p-button-text p-button-sm"
              onClick={onHide}
            />
            <Button
              type="button"
              label={savedSuccess ? '¡Guardado!' : 'Guardar cambios'}
              icon={savedSuccess ? 'pi pi-check' : 'pi pi-save'}
              className="p-button-primary p-button-sm"
              onClick={handleSave}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

