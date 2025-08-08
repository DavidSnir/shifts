import React, { useEffect, useState } from 'react';

export function TimeInput24({ 
  value, 
  onChange, 
  onBlur 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  onBlur: () => void; 
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value.replace(/[^0-9:]/g, '');
    if (inputValue.length === 2 && !inputValue.includes(':')) {
      inputValue += ':';
    }
    if (inputValue.length > 5) {
      inputValue = inputValue.substring(0, 5);
    }
    setDisplayValue(inputValue);
    if (inputValue === '') {
      onChange('');
    } else if (inputValue.match(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
      const [hours, minutes] = inputValue.split(':');
      const formattedTime = `${hours.padStart(2, '0')}:${minutes}`;
      onChange(formattedTime);
    }
  };

  const handleBlur = () => {
    if (displayValue === '') {
      onChange('');
      onBlur();
      return;
    }
    const match = displayValue.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (match) {
      const hours = Math.min(parseInt(match[1] || '0'), 23);
      const minutes = Math.min(parseInt(match[2] || '0'), 59);
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      setDisplayValue(formattedTime);
      onChange(formattedTime);
    }
    onBlur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ([8, 9, 27, 13, 186, 16].indexOf((e as any).keyCode) !== -1 ||
        (e as any).keyCode === 65 && (e as any).ctrlKey === true ||
        (e as any).keyCode === 67 && (e as any).ctrlKey === true ||
        (e as any).keyCode === 86 && (e as any).ctrlKey === true ||
        (e as any).keyCode === 88 && (e as any).ctrlKey === true ||
        ((e as any).keyCode >= 48 && (e as any).keyCode <= 57) ||
        ((e as any).keyCode >= 96 && (e as any).keyCode <= 105)) {
      return;
    }
    e.preventDefault();
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="HH:MM"
      maxLength={5}
      style={{
        fontSize: '12px',
        padding: '6px 4px',
        border: '1px solid #000000',
        fontFamily: 'monospace',
        textAlign: 'center',
        minHeight: '32px',
        width: '100%'
      }}
    />
  );
}


