import { formatError } from '../../i18n/errors';
import { useLocale, translate } from '../../i18n';
import { useState } from 'react';
import { useApiKeysStore } from '../../stores/apiKeys';

export function CredentialVaultControls() {
  useLocale();
  const keys = useApiKeysStore();
  const [passphrase, setPassphrase] = useState('');
  const button = 'rounded border border-gray-600 px-3 py-2 text-xs text-gray-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400';
  const perform = async (action: () => Promise<void>) => {
    try { await action(); } finally { setPassphrase(''); }
  };
  return (
    <div className="space-y-3 border-t border-gray-700 p-4">
      <p className="text-xs text-gray-300">{translate("Keys stay in memory for this tab and are lost on reload. Changes to session keys stop an active simulation and save its world.")}</p>
      {keys.hasLegacyKeys && (
        <div className="rounded border border-yellow-600 p-3 text-xs text-yellow-200" role="status">
          <p>{translate("Old unencrypted keys were found on this device. They are not loaded automatically. Choose how to migrate them below.")}</p>
          <button className={`${button} mt-2`} disabled={keys.isLoading} onClick={() => void perform(() => keys.migrateLegacy())}>{translate("Move old keys to this session")}</button>
        </div>
      )}
      <p className="text-xs text-gray-300" role="status">
        {keys.hasSavedVault ? (keys.vaultUnlocked ? translate("Encrypted vault unlocked for this tab.") : translate("Encrypted vault locked.")) : translate("No encrypted vault saved.")}
      </p>
      <label className="block text-xs text-gray-300">{translate("Vault passphrase (at least 12 characters)")}<input type="password" autoComplete="off" aria-label={translate("Vault passphrase")} value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)} disabled={keys.isLoading} maxLength={1024}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-white" />
      </label>
      <p className="text-xs text-gray-400">{translate("Optional device storage uses AES-GCM encryption. The passphrase is never saved and cannot be recovered. Saving is explicit; edits to session keys do not update the saved vault.")}</p>
      <div className="flex flex-wrap gap-2">
        {keys.hasSavedVault && !keys.vaultUnlocked && <button className={button} disabled={keys.isLoading || passphrase.length < 12} onClick={() => void perform(() => keys.unlockVault(passphrase))}>{translate("Unlock vault")}</button>}
        <button className={button} disabled={keys.isLoading || passphrase.length < 12 || (!keys.vaultUnlocked && keys.hasSavedVault) || keys.hasPendingChanges() || Object.keys(keys.getActiveKeys()).length === 0}
          onClick={() => void perform(() => keys.saveVault(passphrase))}>{translate("Save session keys encrypted")}</button>
        {keys.hasLegacyKeys && <button className={button} disabled={keys.isLoading || passphrase.length < 12} onClick={() => void perform(() => keys.migrateLegacy(passphrase))}>{translate("Encrypt and migrate old keys")}</button>}
        <button className={button} disabled={keys.isLoading} onClick={() => void perform(keys.lockVault)}>{translate("Lock and clear session keys")}</button>
        {keys.hasSavedVault && <button className={button} disabled={keys.isLoading} onClick={() => void perform(keys.forgetVault)}>{translate("Remove saved vault")}</button>}
      </div>
    </div>
  );
}
