import { useState } from 'react';
import { useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { settingsHighlightAtom, settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import type { SettingsPage } from '@/app/store/atoms';
import { NarrowSettingsList } from '@/app/components/Settings/NarrowSettings';
import {
  SettingsSearchInput,
  SettingsSearchResults,
  useSettingsSearch,
} from '@/app/components/Settings/SettingsSearch';
import { AccountSwitcher } from './AccountSwitcher';
import { useSettingsNav } from './Settings';
import { ProfileNavHeader } from './profile';
import { SETTINGS_INDEX } from './searchIndex';
import * as css from './Settings.css';

export function MobileSettingsHome() {
  const items = useSettingsNav();
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const setHighlight = useSetAtom(settingsHighlightAtom);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = useSettingsSearch(items, SETTINGS_INDEX, query);

  const open = (page: SettingsPage, highlight: string | null = null) => {
    setSettingsPage(page);
    setHighlight(highlight);
    setSettingsOpen(true);
  };

  return (
    <NarrowSettingsList
      items={items.filter((item) => item.key !== 'profile')}
      onSelect={(page) => open(page)}
      search={
        <>
          <ProfileNavHeader narrow onSelect={() => open('profile')} />
          <SettingsSearchInput
            className={css.navListSearch}
            value={query}
            onChange={setQuery}
            onSubmit={() =>
              results?.[0] && open(results[0].page, results[0].pageLabel ? results[0].label : null)
            }
          />
        </>
      }
      results={
        results && (
          <SettingsSearchResults
            results={results}
            narrow
            onSelect={(result) => open(result.page, result.pageLabel ? result.label : null)}
          />
        )
      }
      footer={
        <div className={css.navListFooter}>
          <AccountSwitcher onAddAccount={() => navigate('/welcome?add=1')} />
        </div>
      }
    />
  );
}
