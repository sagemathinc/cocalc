/*
Constants and other configuration that impact the overall
look of all of the pages.
*/

export const MAX_WIDTH = "1000px";

export const SHARE_MAX_WIDTH = "1100px";

export const MAX_WIDTH_LANDING = "1200px";

// Return this in getServerSideProps to trigger displaying the 404 page.
export const NOT_FOUND = { notFound: true } as const;
