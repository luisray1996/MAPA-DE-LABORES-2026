
/*
  FUNDO SANTA ROSA
  Autenticación y sincronización con Supabase
*/

(() => {
  let cliente = null;
  let canal = null;
  let cargando = false;

  const categorias = ["aplicaciones", "riegos", "labores"];

  const acceso = () => document.getElementById("santaAcceso");

  const estado = mensaje => {
    const elemento = document.getElementById("santaEstado");
    if (elemento) elemento.textContent = mensaje;
  };

  function mostrarLogin(visible) {
    const login = acceso();
    const sesion = document.getElementById("santaSesion");

    if (login) login.style.display = visible ? "flex" : "none";
    if (sesion) sesion.style.display = visible ? "none" : "block";
  }

  const vacio = () => ({
    aplicaciones: {},
    riegos: {},
    labores: {}
  });

  function verificar(resultado) {
    if (resultado.error) throw resultado.error;
  }

  const db = window.santaDB = {
    listo: false,

    guardarMapaFinal: async (fecha, datos) => {
      if (!db.listo) throw new Error("Inicia sesión primero.");
      const { data: sesion, error: errorSesion } = await cliente.auth.getUser();
      if (errorSesion || !sesion.user) throw new Error("Sesión no válida.");
      const { error } = await cliente.from("historial_mapas").insert({
        fecha, nombre: "Mapa final",
        aplicaciones: datos.aplicaciones || {},
        riegos: datos.riegos || {},
        labores: datos.labores || {},
        guardado_por: sesion.user.id
      });
      if (error) throw error;
    },
    consultarMapas: async fecha => {
      if (!db.listo) throw new Error("Inicia sesión primero.");
      const { data, error } = await cliente.from("historial_mapas")
        .select("id,fecha,nombre,aplicaciones,riegos,labores,guardado_en")
        .eq("fecha", fecha).order("guardado_en", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    sincronizar: async (antes, despues) => {
      if (!db.listo) {
        throw new Error("La base de datos aún no está lista");
      }

      const cambios = [];
      const eliminaciones = [];

      for (const categoria of categorias) {
        const anteriores = antes[categoria] || {};
        const nuevos = despues[categoria] || {};

        for (const [cuartel, valor] of Object.entries(nuevos)) {
          if (
            JSON.stringify(anteriores[cuartel]) !==
            JSON.stringify(valor)
          ) {
            cambios.push({
              categoria: categoria,
              cuartel: Number(cuartel),
              tipo: categoria,
              datos: valor
            });
          }
        }

        for (const cuartel of Object.keys(anteriores)) {
          if (!(cuartel in nuevos)) {
            eliminaciones.push({
              categoria: categoria,
              cuartel: Number(cuartel)
            });
          }
        }
      }

      if (cambios.length > 0) {
        const resultado = await cliente
          .from("registros_cuartel")
          .upsert(cambios, {
            onConflict: "categoria,cuartel"
          });

        verificar(resultado);
      }

      for (const registro of eliminaciones) {
        const resultado = await cliente
          .from("registros_cuartel")
          .delete()
          .eq("categoria", registro.categoria)
          .eq("cuartel", registro.cuartel);

        verificar(resultado);
      }
    }
  };

  async function cargar() {
    if (cargando || !db.listo) return;

    cargando = true;

    try {
      const { data, error } = await cliente
        .from("registros_cuartel")
        .select("categoria,cuartel,datos")
        .limit(1000);

      if (error) throw error;

      const valores = vacio();

      for (const fila of data || []) {
        if (
          Object.prototype.hasOwnProperty.call(
            valores,
            fila.categoria
          )
        ) {
          valores[fila.categoria][fila.cuartel] = fila.datos;
        }
      }

      if (typeof window.santaAplicarDatos === "function") {
        window.santaAplicarDatos(valores);
      }

    } catch (error) {
      console.error("Error al cargar:", error);
      alert(
        "Error al actualizar mapa desde Supabase: " +
        error.message
      );
    } finally {
      cargando = false;
    }
  }

  async function entrar(sesion) {
    db.listo = false;

    if (canal) {
      await cliente.removeChannel(canal);
      canal = null;
    }

    if (!sesion) {
      mostrarLogin(true);

      if (typeof window.santaAplicarDatos === "function") {
        window.santaAplicarDatos(vacio());
      }

      estado("Ingrese con su cuenta autorizada.");
      return;
    }

    estado("Cargando registros compartidos...");

    const usuario = document.getElementById("santaUsuario");

    if (usuario) {
      usuario.textContent = sesion.user.email;
    }

    try {
      const { data, error } = await cliente
        .from("registros_cuartel")
        .select("categoria,cuartel,datos")
        .limit(1000);

      if (error) throw error;

      const valores = vacio();

      for (const fila of data || []) {
        if (
          Object.prototype.hasOwnProperty.call(
            valores,
            fila.categoria
          )
        ) {
          valores[fila.categoria][fila.cuartel] = fila.datos;
        }
      }

      if (typeof window.santaAplicarDatos !== "function") {
        throw new Error(
          "No se encontró la función santaAplicarDatos"
        );
      }

      window.santaAplicarDatos(valores);

      db.listo = true;
      mostrarLogin(false);

      canal = cliente
        .channel("cambios-cuarteles")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "registros_cuartel"
          },
          () => cargar()
        )
        .subscribe();

    } catch (error) {
      console.error("Error al ingresar:", error);
      mostrarLogin(true);

      estado(
        "Error: " + error.message +
        ". Revise la tabla SQL y permisos."
      );
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (!window.supabase?.createClient) {
        throw new Error(
          "No se cargó la biblioteca Supabase. Compruebe internet."
        );
      }

      cliente = window.supabase.createClient(
        window.SANTA_SUPABASE_URL,
        window.SANTA_SUPABASE_KEY
      );

      const formulario = document.getElementById("santaLogin");

      formulario.addEventListener("submit", async evento => {
        evento.preventDefault();

        estado("Verificando usuario...");

        const email = document
          .getElementById("santaEmail")
          .value.trim();

        const password = document
          .getElementById("santaClave")
          .value;

        const { data, error } =
          await cliente.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          estado("No se pudo ingresar: " + error.message);
          return;
        }

        await entrar(data.session);
      });

      document
        .getElementById("santaSalir")
        .addEventListener("click", async () => {
          await cliente.auth.signOut();
          await entrar(null);
        });

      const {
        data: { session },
        error
      } = await cliente.auth.getSession();

      if (error) throw error;

      await entrar(session);

    } catch (error) {
      console.error("Error de conexión:", error);
      estado("Error de conexión: " + error.message);
    }
  });
})();

