import { useRedux } from "@cocalc/frontend/app-framework";
import {
  useSyncdbContext,
  useSyncdbRecord,
} from "@cocalc/frontend/app-framework/syncdb";

export { useSyncdbRecord };

export const useEditorState = useRedux;
export const useSyncValue = useRedux;
export const useSyncDB = useSyncdbContext;
