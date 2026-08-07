import { Search, X } from 'lucide-react';
import { IconButton } from './IconButton';
export function SearchInput({
  value,
  onChange,
  placeholder = 'חיפוש',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-input">
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <IconButton label="ניקוי חיפוש" onClick={() => onChange('')}>
          <X />
        </IconButton>
      )}
    </label>
  );
}
