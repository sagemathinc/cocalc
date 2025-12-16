/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Custom hook for managing registration tokens.
*/

import { Form } from "antd";
import dayjs from "dayjs";
import { pick } from "lodash";
import { useEffect, useState } from "react";

import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { RegistrationTokenSetFields } from "@cocalc/util/db-schema/types";
import { seconds2hms, secure_random_token } from "@cocalc/util/misc";

import { CUSTOM_PRESET_KEY, findPresetKey, type Token } from "./types";

export function formatEphemeralHours(value?: number): string {
  if (value == null) return "";
  const seconds = value / 1000;
  return seconds2hms(seconds, false, false, false);
}

export function ephemeralSignupUrl(token?: string): string {
  if (!token) return "";
  if (typeof window === "undefined") {
    return `/ephemeral?token=${token}`;
  }
  const { protocol, host } = window.location;
  return `${protocol}//${host}/ephemeral?token=${token}`;
}

export function getEphemeralMode(ephemeral?: number): string | undefined {
  const presetKey = findPresetKey(ephemeral);
  return presetKey || (ephemeral != null ? CUSTOM_PRESET_KEY : undefined);
}

export function useRegistrationTokens() {
  const [data, setData] = useState<{ [key: string]: Token }>({});
  const [noOrAllInactive, setNoOrAllInactive] = useState<boolean>(false);
  const [editing, setEditing] = useState<Token | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Token | null>(null);
  const [error, setError] = useState<string>("");
  const [selRows, setSelRows] = useState<any>([]);

  // Antd
  const [form] = Form.useForm();

  // we load the data in a map, indexed by the token
  // dates are converted to dayjs on the fly
  async function load() {
    let result: any;
    setLoading(true);
    try {
      // TODO query should be limited by disabled != true
      result = await query({
        query: {
          registration_tokens: {
            token: "*",
            descr: null,
            expires: null,
            limit: null,
            disabled: null,
            ephemeral: null,
            customize: null,
          },
        },
      });
      const data = {};
      let warn_signup = true;
      for (const x of result.query.registration_tokens) {
        if (x.expires) x.expires = dayjs(x.expires);
        x.active = !x.disabled;
        data[x.token] = x;
        // we have at least one active token → no need to warn user
        if (x.active) warn_signup = false;
      }
      setNoOrAllInactive(warn_signup);
      setError("");
      setData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // every time we show or hide, clear the selection
    setSelRows([]);
    load();
  }, []);

  useEffect(() => {
    if (editing != null) {
      // antd's form want's something called "Store" – which is just this?
      form.setFieldsValue(editing as any);
    }
    if (lastSaved != null) {
      setLastSaved(null);
    }
  }, [editing]);

  // saving a specific token value converts dayjs back to pure Date objects
  // we also record the last saved token as a template for the next add operation
  async function save(val): Promise<void> {
    // antd wraps the time in a dayjs object
    const val_orig: Token = { ...val };
    if (editing != null) setEditing(null);

    // data preparation
    if (val.expires != null && dayjs.isDayjs(val.expires)) {
      val.expires = dayjs(val.expires).toDate();
    }
    val.disabled = !val.active;
    val = pick(val, [
      "token",
      "disabled",
      "expires",
      "limit",
      "descr",
      "ephemeral",
      "customize",
    ] as RegistrationTokenSetFields[]);
    // set optional field to undefined (to get rid of it)
    ["descr", "limit", "expires", "ephemeral"].forEach(
      (k: RegistrationTokenSetFields) => (val[k] = val[k] ?? undefined),
    );
    if (val.customize != null) {
      const { disableCollaborators, disableAI, disableInternet } =
        val.customize;
      if (!disableCollaborators && !disableAI && !disableInternet) {
        val.customize = undefined;
      }
    }
    try {
      setSaving(true);
      await query({
        query: {
          registration_tokens: val,
        },
      });
      // we save the original one, with dayjs in it!
      setLastSaved(val_orig);
      setSaving(false);
      await load();
    } catch (err) {
      // Error path - set error (handle non-Error values)
      const errorMessage = err?.message ?? String(err);
      setError(errorMessage);
      // For modal: preserve editing token for caller to handle
      // For checkbox: just show error
      if (modalVisible) {
        setEditing(val_orig);
      }
      throw err; // Re-throw so caller knows it failed
    } finally {
      setSaving(false);
    }
  }

  async function deleteToken(
    token: string | undefined,
    single: boolean = false,
  ) {
    if (token == null) return;
    if (single) setDeleting(true);

    try {
      await query({
        query: {
          registration_tokens: { token },
        },
        options: [{ delete: true }],
      });
      if (single) load();
    } catch (err) {
      if (single) {
        setError(err);
      } else {
        throw err;
      }
    } finally {
      if (single) setDeleting(false);
    }
  }

  async function deleteTokens(): Promise<void> {
    setDeleting(true);
    try {
      // it's not possible to delete several tokens at once
      await selRows.map(async (token) => await deleteToken(token));
      setSelRows([]);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setDeleting(false);
    }
  }

  // we generate a random token and make sure it doesn't exist
  // TODO also let the user generate one with a validation check
  function newRandomToken(): string {
    return secure_random_token(16);
  }

  // Modal event handlers
  function handleModalOpen(token?: Token): void {
    // IMPORTANT: Reset form first to avoid leaking previous values
    form.resetFields();

    if (token) {
      // Edit mode
      const mode = getEphemeralMode(token.ephemeral);
      form.setFieldsValue({ ...token, _ephemeralMode: mode });
      setEditingToken(token);
    } else {
      // Add mode - use lastSaved as template
      const newToken = {
        ...lastSaved,
        token: newRandomToken(),
        active: true,
      };
      const mode = getEphemeralMode(newToken.ephemeral);
      form.setFieldsValue({ ...newToken, _ephemeralMode: mode });
      setEditingToken(null);
    }
    setModalVisible(true);
    setLastSaved(null); // Clear last saved marker (mimics old useEffect)
  }

  function handleModalCancel(): void {
    setModalVisible(false);
    setEditingToken(null);
    form.resetFields();
  }

  function handleModalReset(): void {
    // Mimics old Reset button: regenerate token, keep lastSaved template
    form.resetFields(); // Clear first to avoid stale values
    const newToken = {
      ...lastSaved,
      token: newRandomToken(),
      active: true,
    };
    const mode = getEphemeralMode(newToken.ephemeral);
    form.setFieldsValue({ ...newToken, _ephemeralMode: mode });
    setEditingToken(null);
  }

  async function handleModalSave(values: Token): Promise<void> {
    const val_orig: Token = { ...values };

    try {
      // Call the existing save() function which handles all transformation and persistence
      await save(values);

      // Success - close modal
      setModalVisible(false);
      setEditingToken(null);
    } catch (err) {
      // Error - keep modal open and preserve user input
      // save() already set the error state, we just need to prevent closing
      setEditingToken(val_orig); // Preserve for limit validation
      form.setFieldsValue(val_orig); // Restore form with user's values
    }
  }

  return {
    data,
    form,
    saving,
    deleting,
    deleteToken,
    deleteTokens,
    loading,
    lastSaved,
    error,
    setError,
    selRows,
    setSelRows,
    setDeleting,
    newRandomToken,
    save,
    load,
    noOrAllInactive,
    // Modal-related
    modalVisible,
    editingToken,
    handleModalOpen,
    handleModalCancel,
    handleModalReset,
    handleModalSave,
  };
}
