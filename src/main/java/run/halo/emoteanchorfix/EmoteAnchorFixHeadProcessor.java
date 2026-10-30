package run.halo.emoteanchorfix;

import java.util.Properties;
import org.springframework.stereotype.Component;
import org.springframework.util.PropertyPlaceholderHelper;
import org.thymeleaf.context.ITemplateContext;
import org.thymeleaf.model.IModel;
import org.thymeleaf.model.IModelFactory;
import org.thymeleaf.processor.element.IElementModelStructureHandler;
import reactor.core.publisher.Mono;
import run.halo.app.plugin.PluginContext;
import run.halo.app.theme.dialect.TemplateHeadProcessor;

/**
 * Injects the front-end fix into every rendered page.
 *
 * <p>The comment widget repositions its emote panel with viewport coordinates once the
 * panel switches to {@code position: fixed}. A theme that leaves a non-{@code none}
 * transform on an ancestor of the widget turns that ancestor into the containing block,
 * so the panel is painted far away from the button. The script corrects the panel
 * placement after the widget opens it.
 */
@Component
public class EmoteAnchorFixHeadProcessor implements TemplateHeadProcessor {

    static final PropertyPlaceholderHelper PROPERTY_PLACEHOLDER_HELPER =
        new PropertyPlaceholderHelper("${", "}");

    private final PluginContext pluginContext;

    public EmoteAnchorFixHeadProcessor(PluginContext pluginContext) {
        this.pluginContext = pluginContext;
    }

    @Override
    public Mono<Void> process(ITemplateContext context, IModel model,
                              IElementModelStructureHandler structureHandler) {
        final IModelFactory modelFactory = context.getModelFactory();
        model.add(modelFactory.createText(script()));
        return Mono.empty();
    }

    private String script() {
        final Properties properties = new Properties();
        properties.setProperty("version", pluginContext.getVersion());
        return PROPERTY_PLACEHOLDER_HELPER.replacePlaceholders("""
            <!-- plugin-emote-anchor-fix start -->
            <script defer src="/plugins/plugin-emote-anchor-fix/assets/static/emote-anchor-fix.js?version=${version}"></script>
            <!-- plugin-emote-anchor-fix end -->
            """, properties);
    }
}