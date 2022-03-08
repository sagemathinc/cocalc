import md5 from "md5";

export default function gravatarUrl(email: string): string {
  return `https://www.gravatar.com/avatar/${md5(
    email.toLowerCase()
  )}?d=identicon&s=30`;
}
