import { Input, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { setServerTitle } from "./api";

const NO_TITLE = "No Title";

interface Props {
  title?: string;
  id?: number;
  editable?: boolean;
  setError?;
  onChange?;
  style?;
  onPressEnter?;
}

export default function Title({
  title,
  id,
  editable,
  setError,
  onChange,
  style,
  onPressEnter,
}: Props) {
  const titleRef = useRef<any>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const isFocusedRef = useRef<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>(
    title?.trim() ? title : NO_TITLE,
  );
  useEffect(() => {
    if (!editable || !isFocusedRef.current) {
      setNewTitle(title?.trim() ? title : NO_TITLE);
    }
  }, [title]);

  useEffect(() => {
    if (!editable) return;
    setTimeout(() => (titleRef.current as any)?.input?.select(), 1);
  }, []);

  if (!editable) {
    return <div style={style}>{newTitle}</div>;
  }

  const handleSave = async () => {
    if (newTitle == title) {
      return;
    }
    if (onChange != null) {
      onChange(newTitle);
    }
    if (id != null) {
      // save to backend
      try {
        setSaving(true);
        await setServerTitle({ title: newTitle, id });
      } catch (err) {
        setError(`${err}`);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <Input
      placeholder={"Title..."}
      ref={titleRef}
      style={{ width: "275px", ...style }}
      value={newTitle}
      onChange={(e) => setNewTitle(e.target.value)}
      onPressEnter={() => {
        handleSave();
        onPressEnter?.();
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        isFocusedRef.current = false;
        handleSave();
      }}
      addonAfter={
        saving ? (
          <Spin delay={1000} style={{ marginLeft: "15px" }} />
        ) : undefined
      }
    />
  );
}
