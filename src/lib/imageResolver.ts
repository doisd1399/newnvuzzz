export function getProfileImage(user:any){
  return user?.profilePhotoURL || null;
}
export function getApplicationImage(app:any){
  return app?.applicationPhotoURL || null;
}
export function getCompanyImage(company:any){
  return company?.companyLogoURL || null;
}
