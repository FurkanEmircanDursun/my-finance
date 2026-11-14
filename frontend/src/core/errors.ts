/** Only application-authored messages may cross an error boundary unchanged. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}
