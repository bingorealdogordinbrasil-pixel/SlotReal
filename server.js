const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO BANCO DE DADOS
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

// MODELO DE USUÁRIO
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 } // Começa com ZERO
}));

// --- LÓGICA DO GIRO (PROTEGIDA NO SERVIDOR) ---
app.post('/api/spin', async (req, res) => {
    try {
        const { user, bets } = req.body;
        const userDb = await User.findOne({ user });
        if (!userDb || userDb.saldo < 0) return res.status(400).json({ success: false });

        // 1. ACHAR A COR COM MENOR VOLUME DE DINHEIRO
        let corAlvo = 0;
        let menorValor = Infinity;
        let coresVazias = [];

        bets.forEach((valor, i) => {
            if (valor === 0) coresVazias.push(i);
            if (valor < menorValor) {
                menorValor = valor;
                corAlvo = i;
            }
        });

        // Se houver cores sem nenhuma aposta, cai em uma delas obrigatoriamente
        if (coresVazias.length > 0) {
            corAlvo = coresVazias[Math.floor(Math.random() * coresVazias.length)];
        }

        // 2. CALCULAR RESULTADO
        const premio = bets[corAlvo] * 5.0; // Paga 5x
        const novoSaldo = Number((userDb.saldo + premio).toFixed(2));

        await User.findOneAndUpdate({ user }, { saldo: novoSaldo });

        res.json({ 
            success: true, 
            corAlvo, 
            novoSaldo,
            ganhou: premio > 0 
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- SISTEMA DE LOGIN E CADASTRO ---
app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    const conta = await User.findOne({ user, pass });
    if (conta) res.json({ success: true, saldo: conta.saldo });
    else res.json({ success: false, message: "Usuário ou senha incorretos" });
});

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false, message: "Nome de usuário já existe" }); }
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo });
    res.json({ success: true });
});

// --- MERCADO PAGO (PIX) ---
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

app.post('/gerar-pix', async (req, res) => {
    try {
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(req.body.valor),
            description: 'Deposito SlotReal',
            payment_method_id: 'pix',
            external_reference: req.body.userLogado,
            payer: { email: 'contato@slot.com' }
        }});
        res.json({ 
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code, 
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64 
        });
    } catch (e) { res.status(500).json(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
