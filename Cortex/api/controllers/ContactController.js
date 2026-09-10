import contactDossierService from '../services/ContactDossierService.js';
import * as User from '../models/Auth.js';

export const getContactContext = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const email = req.query.email;
        const dossier = await contactDossierService.getContactDossier(user, email);

        return res.status(200).json({
            success: true,
            data: dossier
        });
    } catch (error) {
        next(error);
    }
};
